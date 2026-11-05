import { describe, expect, it } from 'vitest';
import type { Card, CardId, GameMode, Rank, Seat, Suit } from '../shared/types.js';
import { makeCard } from './deck.js';
import { CARDS_PER_PLAYER, dealHand, playCard, startHand, type HandState } from './hand.js';
import { seedRng } from './rng.js';
import { GAME_MODES, maoSeat, seatsOf } from './seating.js';

const SUIT_BY_CODE: Record<string, Suit> = { c: 'clubs', h: 'hearts', s: 'spades', d: 'diamonds' };

/** `c('Ac')` → ace of clubs. */
function c(id: CardId): Card {
  return makeCard(id[0] as Rank, SUIT_BY_CODE[id[1] ?? ''] as Suit);
}

function hand(...ids: CardId[]): Card[] {
  return ids.map(c);
}

// Vira 7 → manilha Q.
const VIRA = c('7d');

/** Plays each card in turn, whoever's turn it is; fails the test on any rejection. */
function playAll(state: HandState, ...ids: CardId[]): HandState {
  let s = state;
  for (const id of ids) {
    if (s.turn === null) throw new Error(`Hand already over before playing ${id}`);
    const result = playCard(s, s.turn, id);
    if (!result.ok) throw new Error(`Playing ${id} from seat ${s.turn}: ${result.error}`);
    s = result.state;
  }
  return s;
}

/** A 2-player hand where seat 0 is the mão (seat 1 deals). */
function twoPlayer(h0: CardId[], h1: CardId[]): HandState {
  return startHand(2, 1, [hand(...h0), hand(...h1)], VIRA);
}

describe('dealHand', () => {
  it.each(GAME_MODES)('%i players: 3 distinct cards each, plus a vira nobody holds', (mode) => {
    const [state] = dealHand(mode, 0, seedRng(42));
    expect(state.hands).toHaveLength(mode);
    for (const h of state.hands) expect(h).toHaveLength(CARDS_PER_PLAYER);
    const ids = [...state.hands.flat().map((card) => card.id), state.vira.id];
    expect(new Set(ids).size).toBe(mode * CARDS_PER_PLAYER + 1);
  });

  it('is deterministic for a seed and advances the RNG', () => {
    const rng = seedRng(7);
    const [a, nextA] = dealHand(4, 2, rng);
    const [b, nextB] = dealHand(4, 2, rng);
    expect(a).toEqual(b);
    expect(nextA).toBe(nextB);
    expect(nextA).not.toBe(rng);
    expect(dealHand(4, 2, nextA)[0]).not.toEqual(a);
  });

  it.each(GAME_MODES)('%i players: the mão (dealer’s right) leads trick 1', (mode) => {
    for (const dealer of seatsOf(mode)) {
      const [state] = dealHand(mode, dealer, seedRng(dealer));
      expect(state.dealer).toBe(dealer);
      expect(state.mao).toBe(maoSeat(dealer, mode));
      expect(state.turn).toBe(state.mao);
      expect(state.trick).toEqual([]);
      expect(state.tricks).toEqual([]);
      expect(state.winner).toBeNull();
    }
  });
});

describe('startHand', () => {
  it('rejects the wrong number of hands', () => {
    expect(() => startHand(4, 0, [hand('4c', '5c', '6c'), hand('4h', '5h', '6h')], VIRA)).toThrow();
  });

  it('rejects a hand without exactly 3 cards', () => {
    expect(() => startHand(2, 0, [hand('4c', '5c'), hand('4h', '5h', '6h')], VIRA)).toThrow();
  });

  it('rejects a card dealt twice, including the vira', () => {
    expect(() => twoPlayer(['4c', '5c', '6c'], ['4c', '5h', '6h'])).toThrow();
    expect(() => twoPlayer(['7d', '5c', '6c'], ['4h', '5h', '6h'])).toThrow();
  });

  it('rejects an invalid dealer', () => {
    expect(() => startHand(2, 2, [hand('4c', '5c', '6c'), hand('4h', '5h', '6h')], VIRA)).toThrow();
  });

  it('copies the hands so the caller cannot mutate the state', () => {
    const hands = [hand('4c', '5c', '6c'), hand('4h', '5h', '6h')];
    const state = startHand(2, 1, hands, VIRA);
    hands[0]?.pop();
    expect(state.hands[0]).toHaveLength(3);
  });
});

describe('playCard', () => {
  const start = twoPlayer(['3c', 'Kc', '4c'], ['2h', 'Jh', '5h']);

  it('removes the card, adds it to the trick and passes the turn counter-clockwise', () => {
    const result = playCard(start, 0, 'Kc');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.hands[0]?.map((card) => card.id)).toEqual(['3c', '4c']);
    expect(result.state.trick).toEqual([{ seat: 0, card: c('Kc'), faceDown: false }]);
    expect(result.state.turn).toBe(1);
  });

  it('does not mutate the previous state', () => {
    const snapshot = structuredClone(start);
    playAll(start, 'Kc', '2h', 'Jh');
    expect(start).toEqual(snapshot);
  });

  it('rejects a play out of turn', () => {
    expect(playCard(start, 1, '2h')).toEqual({ ok: false, error: 'not_your_turn' });
    expect(playCard(start, 5, '2h')).toEqual({ ok: false, error: 'not_your_turn' });
  });

  it('rejects a card the player does not hold', () => {
    expect(playCard(start, 0, '2h')).toEqual({ ok: false, error: 'card_not_in_hand' });
    const after = playAll(start, 'Kc', '2h');
    expect(playCard(after, 1, 'Kc')).toEqual({ ok: false, error: 'card_not_in_hand' });
  });

  it('resolves a full trick, and its winner leads the next one', () => {
    const state = playAll(start, 'Kc', '2h');
    expect(state.trick).toEqual([]);
    expect(state.tricks).toEqual([
      {
        plays: [
          { seat: 0, card: c('Kc'), faceDown: false },
          { seat: 1, card: c('2h'), faceDown: false },
        ],
        result: { winner: 1, leader: 1 },
      },
    ]);
    expect(state.turn).toBe(1);
    expect(state.winner).toBeNull();
  });

  it('ends the hand 2-0 without a third trick and rejects further plays', () => {
    const state = playAll(start, '3c', '2h', 'Kc', 'Jh');
    expect(state.tricks).toHaveLength(2);
    expect(state.winner).toBe(0);
    expect(state.turn).toBeNull();
    expect(playCard(state, 0, '4c')).toEqual({ ok: false, error: 'hand_over' });
    expect(playCard(state, 1, '5h')).toEqual({ ok: false, error: 'hand_over' });
  });

  it('plays all three tricks at 1-1', () => {
    const state = playAll(start, 'Kc', '2h', 'Jh', '3c', '4c', '5h');
    expect(state.tricks.map((t) => t.result.winner)).toEqual([1, 0, 1]);
    expect(state.winner).toBe(1);
    expect(state.hands).toEqual([[], []]);
  });
});

describe('face-down play (encoberta)', () => {
  const start = twoPlayer(['3c', 'Kc', '4c'], ['2h', 'Jh', '5h']);

  /** Plays one card from whoever's turn it is; fails the test on any rejection. */
  function playDown(state: HandState, id: CardId): HandState {
    if (state.turn === null) throw new Error(`Hand already over before playing ${id}`);
    const result = playCard(state, state.turn, id, true);
    if (!result.ok)
      throw new Error(`Playing ${id} face down from seat ${state.turn}: ${result.error}`);
    return result.state;
  }

  it('is not allowed in trick 1', () => {
    expect(playCard(start, 0, 'Kc', true)).toEqual({ ok: false, error: 'face_down_not_allowed' });
    const afterLead = playAll(start, 'Kc');
    expect(playCard(afterLead, 1, '5h', true)).toEqual({
      ok: false,
      error: 'face_down_not_allowed',
    });
  });

  it('is allowed from trick 2, and the card leaves the hand', () => {
    const trick2 = playAll(start, '3c', '2h');
    const state = playDown(trick2, '4c');
    expect(state.hands[0]?.map((card) => card.id)).toEqual(['Kc']);
    expect(state.trick).toEqual([{ seat: 0, card: c('4c'), faceDown: true }]);
    expect(state.turn).toBe(1);
  });

  it('a face-down card loses to any face-up card', () => {
    // Trick 1: 2♥ beats K♣. Trick 2: seat 1 hides J♥, seat 0's 4♣ takes it.
    const trick2 = playAll(start, 'Kc', '2h');
    const state = playAll(playDown(trick2, 'Jh'), '4c');
    expect(state.tricks[1]?.result).toEqual({ winner: 0, leader: 0 });
    expect(state.tricks[1]?.plays).toEqual([
      { seat: 1, card: c('Jh'), faceDown: true },
      { seat: 0, card: c('4c'), faceDown: false },
    ]);
    expect(state.turn).toBe(0);
  });

  it('two face-down cards tie the trick', () => {
    // Trick 1: seat 0 wins. Trick 2: both face down → tie → trick-1 winner takes the hand.
    const trick2 = playAll(start, '3c', '2h');
    const state = playDown(playDown(trick2, '4c'), '5h');
    expect(state.tricks[1]?.result).toEqual({ winner: null, leader: 0 });
    expect(state.winner).toBe(0);
  });

  it('is allowed in trick 3', () => {
    const trick3 = playAll(start, 'Kc', '2h', 'Jh', '3c');
    const state = playAll(playDown(trick3, '4c'), '5h');
    expect(state.tricks[2]?.plays[0]?.faceDown).toBe(true);
    expect(state.tricks[2]?.result.winner).toBe(1);
    expect(state.winner).toBe(1);
  });

  it('still checks the turn and the card before the face-down rule', () => {
    expect(playCard(start, 1, '2h', true)).toEqual({ ok: false, error: 'not_your_turn' });
    const trick2 = playAll(start, '3c', '2h');
    expect(playCard(trick2, 0, '2h', true)).toEqual({ ok: false, error: 'card_not_in_hand' });
  });
});

describe('tie scenarios in a full hand', () => {
  it('trick 1 tied → trick 2 winner takes the hand, no third trick', () => {
    const start = twoPlayer(['3c', 'Kc', '4c'], ['3h', 'Jh', '5h']);
    const state = playAll(start, '3c', '3h', 'Kc', 'Jh');
    expect(state.tricks.map((t) => t.result.winner)).toEqual([null, 0]);
    expect(state.winner).toBe(0);
  });

  it('after a tie the first player of a tied top card leads the next trick', () => {
    const start = twoPlayer(['3c', 'Kc', '4c'], ['3h', 'Jh', '5h']);
    expect(playAll(start, '3c', '3h').turn).toBe(0);
  });

  it('trick 1 and 2 tied → trick 3 decides', () => {
    const start = twoPlayer(['3c', 'Kc', '4c'], ['3h', 'Kh', '5h']);
    const state = playAll(start, '3c', '3h', 'Kc', 'Kh', '4c', '5h');
    expect(state.tricks.map((t) => t.result.winner)).toEqual([null, null, 1]);
    expect(state.winner).toBe(1);
  });

  it('all three tied → the mão’s team wins', () => {
    // Seat 1 deals, so seat 0 is the mão.
    const start = twoPlayer(['3c', 'Kc', '4c'], ['3h', 'Kh', '4h']);
    const state = playAll(start, '3c', '3h', 'Kc', 'Kh', '4c', '4h');
    expect(state.tricks.map((t) => t.result.winner)).toEqual([null, null, null]);
    expect(state.winner).toBe(0);

    // Same cards, but seat 0 deals: now seat 1 is the mão.
    const flipped = startHand(2, 0, [hand('3c', 'Kc', '4c'), hand('3h', 'Kh', '4h')], VIRA);
    const other = playAll(flipped, '3h', '3c', 'Kh', 'Kc', '4h', '4c');
    expect(other.winner).toBe(1);
  });

  it('trick 1 won, trick 2 tied → trick-1 winner, no third trick', () => {
    const start = twoPlayer(['3c', 'Kc', '4c'], ['2h', 'Kh', '5h']);
    const state = playAll(start, '3c', '2h', 'Kc', 'Kh');
    expect(state.tricks.map((t) => t.result.winner)).toEqual([0, null]);
    expect(state.tricks).toHaveLength(2);
    expect(state.winner).toBe(0);
  });

  it('1-1 and trick 3 tied → trick-1 winner', () => {
    const start = twoPlayer(['3c', 'Kc', '4c'], ['2h', 'Ah', '4h']);
    const state = playAll(start, '3c', '2h', 'Kc', 'Ah', '4h', '4c');
    expect(state.tricks.map((t) => t.result.winner)).toEqual([0, 1, null]);
    expect(state.winner).toBe(0);
  });
});

describe('multi-player hands', () => {
  function playTrickOrder(state: HandState, ids: CardId[]): Seat[] {
    const seats: Seat[] = [];
    let s = state;
    for (const id of ids) {
      if (s.turn === null) break;
      seats.push(s.turn);
      s = playAll(s, id);
    }
    return seats;
  }

  it('4 players: turns go counter-clockwise from the mão, partners share a trick', () => {
    // Dealer 3 → mão 0. Team 0 = seats 0, 2; team 1 = seats 1, 3.
    const start = startHand(
      4,
      3,
      [
        hand('3c', 'Ac', '4c'),
        hand('2h', 'Kh', '5h'),
        hand('3d', 'Kd', '6d'),
        hand('Js', 'Ks', '7s'),
      ],
      VIRA,
    );
    expect(playTrickOrder(start, ['3c', '2h', '3d', 'Js'])).toEqual([0, 1, 2, 3]);

    const afterTrick1 = playAll(start, '3c', '2h', '3d', 'Js');
    expect(afterTrick1.tricks[0]?.result).toEqual({ winner: 0, leader: 0 });
    expect(afterTrick1.turn).toBe(0);

    const end = playAll(afterTrick1, 'Ac', 'Kh', 'Kd', 'Ks');
    expect(end.winner).toBe(0);
  });

  it('4 players: a tie between opponents, then the winner of trick 2 takes the hand', () => {
    // Dealer 0 → mão 1.
    const start = startHand(
      4,
      0,
      [
        hand('5c', 'Kc', '4c'),
        hand('3h', 'Jh', '5h'),
        hand('3d', 'Kd', '6d'),
        hand('Js', 'Qs', '7s'),
      ],
      VIRA,
    );
    // Trick 1: seat 1 plays 3h, seat 2 plays 3d → tie; seat 1 laid the first 3.
    const afterTrick1 = playAll(start, '3h', '3d', 'Js', '5c');
    expect(afterTrick1.tricks[0]?.result).toEqual({ winner: null, leader: 1 });
    expect(afterTrick1.turn).toBe(1);
    // Trick 2: seat 3's manilha (Q♠) takes it for team 1.
    const end = playAll(afterTrick1, 'Jh', 'Kd', 'Qs', 'Kc');
    expect(end.tricks[1]?.result).toEqual({ winner: 1, leader: 3 });
    expect(end.winner).toBe(1);
    expect(end.turn).toBeNull();
  });

  it('6 players: everyone plays once per trick, in counter-clockwise order', () => {
    // Dealer 4 → mão 5.
    const start = startHand(
      6,
      4,
      [
        hand('4c', '5c', '6c'),
        hand('4h', '5h', '6h'),
        hand('4s', '5s', '6s'),
        hand('4d', '5d', '6d'),
        hand('Jc', 'Kc', 'Ac'),
        hand('Jh', 'Kh', 'Ah'),
      ],
      VIRA,
    );
    expect(playTrickOrder(start, ['Jh', '4c', '4h', '4s', '4d', 'Jc'])).toEqual([5, 0, 1, 2, 3, 4]);

    // Trick 1: J♥ (seat 5, team 1) and J♣ (seat 4, team 0) tie at the top.
    const t1 = playAll(start, 'Jh', '4c', '4h', '4s', '4d', 'Jc');
    expect(t1.tricks[0]?.result).toEqual({ winner: null, leader: 5 });
    // Trick 2: tie again (K♥ vs K♣).
    const t2 = playAll(t1, 'Kh', '5c', '5h', '5s', '5d', 'Kc');
    expect(t2.tricks[1]?.result).toEqual({ winner: null, leader: 5 });
    // Trick 3: tie again (A♥ vs A♣) → the mão (seat 5, team 1) wins.
    const t3 = playAll(t2, 'Ah', '6c', '6h', '6s', '6d', 'Ac');
    expect(t3.tricks[2]?.result.winner).toBeNull();
    expect(t3.winner).toBe(1);
  });

  it.each(GAME_MODES)(
    '%i players: random deals always finish in 2 or 3 tricks',
    (mode: GameMode) => {
      for (let seed = 0; seed < 200; seed++) {
        let [state] = dealHand(mode, seed % mode, seedRng(seed));
        while (state.turn !== null) {
          const card = state.hands[state.turn]?.[0];
          if (card === undefined) throw new Error('Ran out of cards mid-hand');
          state = playAll(state, card.id);
        }
        expect(state.winner).not.toBeNull();
        expect([2, 3]).toContain(state.tricks.length);
        for (const t of state.tricks) expect(t.plays).toHaveLength(mode);
      }
    },
  );
});
