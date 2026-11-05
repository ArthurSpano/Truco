import { describe, expect, it } from 'vitest';
import type { Card, CardId, GameMode, Rank, Suit } from '../shared/types.js';
import { makeCard } from './deck.js';
import { dealHand, playBlind, playCard, startHand, type HandState } from './hand.js';
import { MAO_DE_FERRO_VALUE, isMaoDeFerro } from './maoDeFerro.js';
import { decideMaoDeOnze, handsVisibleTo } from './maoDeOnze.js';
import { seedRng } from './rng.js';
import { seatsOf } from './seating.js';
import { tableCard } from './tricks.js';
import { callTruco } from './truco.js';

const SUIT_BY_CODE: Record<string, Suit> = { c: 'clubs', h: 'hearts', s: 'spades', d: 'diamonds' };

function c(id: CardId): Card {
  return makeCard(id[0] as Rank, SUIT_BY_CODE[id[1] ?? ''] as Suit);
}

// Vira 7 → manilha Q.
const VIRA = c('7d');

/** Six disjoint non-manilha hands, enough for any mode. */
const HANDS: CardId[][] = [
  ['3c', '4c', '5c'],
  ['2c', '4h', '5h'],
  ['3h', '4s', '5s'],
  ['2h', '4d', '5d'],
  ['3s', '6c', '6h'],
  ['2s', '6s', '6d'],
];

/** A fresh hand where seat 0 is the mão (the last seat deals), optionally a mão de ferro. */
function fresh(mode: GameMode, maoDeFerro = true): HandState {
  return startHand(
    mode,
    mode - 1,
    HANDS.slice(0, mode).map((ids) => ids.map(c)),
    VIRA,
    { maoDeFerro },
  );
}

function ok(result: { ok: true; state: HandState } | { ok: false; error: string }): HandState {
  if (!result.ok) throw new Error(`Unexpected rejection: ${result.error}`);
  return result.state;
}

/**
 * Plays each card in turn, whoever's turn it is: blind (by its slot) in a
 * mão de ferro, by id otherwise. Ids only make the tests readable.
 */
function playAll(state: HandState, ...ids: CardId[]): HandState {
  let s = state;
  for (const id of ids) {
    const seat = s.turn;
    if (seat === null) throw new Error(`Hand already over before playing ${id}`);
    if (s.maoDeFerro) {
      const slot = (s.hands[seat] ?? []).findIndex((card) => card.id === id);
      s = ok(playBlind(s, seat, slot));
    } else {
      s = ok(playCard(s, seat, id));
    }
  }
  return s;
}

describe('constants', () => {
  it('a mão de ferro is worth 1 point', () => {
    expect(MAO_DE_FERRO_VALUE).toBe(1);
  });
});

describe('isMaoDeFerro', () => {
  it('is true only when both teams are at 11', () => {
    expect(isMaoDeFerro([11, 11])).toBe(true);
    expect(isMaoDeFerro([11, 10])).toBe(false);
    expect(isMaoDeFerro([0, 11])).toBe(false);
    expect(isMaoDeFerro([0, 0])).toBe(false);
  });
});

describe('starting a mão de ferro', () => {
  it('ordinary hands are not a mão de ferro', () => {
    expect(fresh(2, false).maoDeFerro).toBe(false);
    expect(
      startHand(
        2,
        1,
        HANDS.slice(0, 2).map((ids) => ids.map(c)),
        VIRA,
      ).maoDeFerro,
    ).toBe(false);
  });

  it('is worth 1, has no pending decision and play starts with the mão', () => {
    for (const mode of [2, 4, 6] as const) {
      const s = fresh(mode);
      expect(s.maoDeFerro).toBe(true);
      expect(s.value).toBe(MAO_DE_FERRO_VALUE);
      expect(s.maoDeOnze).toBeNull();
      expect(s.turn).toBe(s.mao);
    }
  });

  it('dealHand passes the option through', () => {
    const [hand] = dealHand(4, 0, seedRng(7), { maoDeFerro: true });
    expect(hand.maoDeFerro).toBe(true);
  });

  it('cannot also be a mão de onze', () => {
    expect(() =>
      startHand(
        2,
        1,
        HANDS.slice(0, 2).map((ids) => ids.map(c)),
        VIRA,
        {
          maoDeFerro: true,
          maoDeOnze: 0,
        },
      ),
    ).toThrow(/mão de ferro/);
  });
});

describe('playing blind', () => {
  it('cards are played without a decision and compete by their real value', () => {
    // 2 players: 3c beats 2c, then 4c ties 4h → trick-1 winner (seat 0) takes it.
    const s = playAll(fresh(2), '3c', '2c', '4c', '4h');
    expect(s.winner).toBe(0);
    expect(s.value).toBe(1);
    expect(s.tricks.map((t) => t.result.winner)).toEqual([0, null]);
  });

  it('the opponents can win it too, still for 1 point', () => {
    // 2c beats 5c, then 4h ties 4c → trick-1 winner (seat 1) takes it.
    const s = playAll(fresh(2), '5c', '2c', '4h', '4c');
    expect(s.winner).toBe(1);
    expect(s.value).toBe(MAO_DE_FERRO_VALUE);
  });

  it('played cards are revealed on the table, since nobody chose them knowingly', () => {
    const s = playAll(fresh(4), '3c', '2c');
    expect(s.trick.map(tableCard)).toEqual([
      { seat: 0, faceDown: false, card: c('3c') },
      { seat: 1, faceDown: false, card: c('2c') },
    ]);
  });

  it('a full 6-player mão de ferro is played to the end', () => {
    // Trick 1: 3c, 2c, 3h, 2h, 3s, 2s → three 3s on team 0 vs 2s → team 0 (seat 0 leads).
    let s = playAll(fresh(6), '3c', '2c', '3h', '2h', '3s', '2s');
    expect(s.tricks[0]?.result.winner).toBe(0);
    // Trick 2: 4c, 4h, 4s, 4d, 6c, 6s → 6s are top, seat 4 (team 0) and seat 5 (team 1) → tie.
    s = playAll(s, '4c', '4h', '4s', '4d', '6c', '6s');
    expect(s.winner).toBe(0);
    expect(s.value).toBe(1);
  });

  it('plays the card at the given position of the hand, in deal order', () => {
    // Seat 0 holds 3c, 4c, 5c: slot 2 is the 5c.
    let s = ok(playBlind(fresh(2), 0, 2));
    expect(s.trick).toEqual([{ seat: 0, card: c('5c'), faceDown: false }]);
    expect(s.hands[0]).toEqual([c('3c'), c('4c')]);
    // Slots refer to the cards still held: seat 1 (2c, 4h, 5h) plays slot 0, the 2c.
    s = ok(playBlind(s, 1, 0));
    expect(s.tricks[0]?.plays.map((p) => p.card.id)).toEqual(['5c', '2c']);
    expect(s.hands[1]).toEqual([c('4h'), c('5h')]);
  });

  it('cards cannot be picked by id, which would let a player choose or probe a blind hand', () => {
    const s = fresh(2);
    expect(playCard(s, 0, '3c')).toEqual({ ok: false, error: 'blind_play_required' });
    expect(playCard(s, 0, '2c')).toEqual({ ok: false, error: 'blind_play_required' });
    // Deliberate face-down play (encoberta) is not possible either: every card is already blind.
    const later = playAll(s, '3c', '2c');
    expect(playCard(later, 0, '4c', true)).toEqual({ ok: false, error: 'blind_play_required' });
    // An ordinary hand still allows encoberta from trick 2.
    const ordinary = playAll(fresh(2, false), '3c', '2c');
    expect(playCard(ordinary, 0, '4c', true).ok).toBe(true);
  });

  it('rejects slots the player does not have', () => {
    const s = fresh(2);
    for (const slot of [-1, 3, 0.5, Number.NaN]) {
      expect(playBlind(s, 0, slot)).toEqual({ ok: false, error: 'invalid_slot' });
    }
    // 3c beats 4h, then 5h beats 4c: 1-1, and seat 1 leads trick 3 with one card left.
    const last = playAll(s, '3c', '4h', '4c', '5h');
    expect(last.turn).toBe(1);
    const seat = 1;
    expect(playBlind(last, seat, 1)).toEqual({ ok: false, error: 'invalid_slot' });
    expect(playBlind(last, seat, 0).ok).toBe(true);
  });

  it('blind play is only for a mão de ferro', () => {
    expect(playBlind(fresh(2, false), 0, 0)).toEqual({ ok: false, error: 'not_mao_de_ferro' });
  });

  it('still enforces turn order and the end of the hand', () => {
    const s = fresh(2);
    expect(playBlind(s, 1, 0)).toEqual({ ok: false, error: 'not_your_turn' });
    const over = playAll(s, '3c', '2c', '4c', '4h');
    expect(over.winner).not.toBeNull();
    expect(playBlind(over, 0, 0)).toEqual({ ok: false, error: 'hand_over' });
  });
});

describe('no truco in a mão de ferro', () => {
  it('nobody may call truco, at any point of the hand', () => {
    let s = fresh(4);
    expect(callTruco(s, 0)).toEqual({ ok: false, error: 'truco_not_allowed' });
    s = playAll(s, '3c');
    expect(callTruco(s, 1)).toEqual({ ok: false, error: 'truco_not_allowed' });
    s = playAll(s, '2c', '3h', '2h');
    expect(callTruco(s, s.turn ?? -1)).toEqual({ ok: false, error: 'truco_not_allowed' });
  });

  it('there is no mão de onze decision to make', () => {
    expect(decideMaoDeOnze(fresh(4), 0, true)).toEqual({
      ok: false,
      error: 'no_decision_pending',
    });
  });
});

describe('handsVisibleTo in a mão de ferro', () => {
  it('nobody sees any hand, not even their own', () => {
    for (const mode of [2, 4, 6] as const) {
      const s = fresh(mode);
      for (const seat of seatsOf(mode)) expect(handsVisibleTo(s, seat)).toEqual([]);
    }
  });

  it('stays blind until the hand is over', () => {
    const s = playAll(fresh(2), '3c', '2c');
    expect(handsVisibleTo(s, 0)).toEqual([]);
    expect(handsVisibleTo(s, 1)).toEqual([]);
  });

  it('ordinary hands still show each player their own cards', () => {
    const s = fresh(2, false);
    expect(handsVisibleTo(s, 0)).toEqual([0]);
  });

  it('throws on a seat outside the table', () => {
    expect(() => handsVisibleTo(fresh(2), 2)).toThrow();
  });
});
