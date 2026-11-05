import { describe, expect, it } from 'vitest';
import type { Card, CardId, GameMode, Rank, Seat, Suit } from '../shared/types.js';
import { makeCard } from './deck.js';
import { playCard, startHand, type HandState } from './hand.js';
import {
  BASE_HAND_VALUE,
  TRUCO_LADDER,
  callTruco,
  nextStake,
  respondTruco,
  type TrucoAnswer,
} from './truco.js';

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

/** A fresh hand where seat 0 is the mão (the last seat deals). */
function fresh(mode: GameMode): HandState {
  return startHand(
    mode,
    mode - 1,
    HANDS.slice(0, mode).map((ids) => ids.map(c)),
    VIRA,
  );
}

function ok(result: { ok: true; state: HandState } | { ok: false; error: string }): HandState {
  if (!result.ok) throw new Error(`Unexpected rejection: ${result.error}`);
  return result.state;
}

const call = (s: HandState, seat: Seat): HandState => ok(callTruco(s, seat));
const answer = (s: HandState, seat: Seat, a: TrucoAnswer): HandState =>
  ok(respondTruco(s, seat, a));
const play = (s: HandState, seat: Seat, id: CardId): HandState => ok(playCard(s, seat, id));

describe('the ladder', () => {
  it('goes 1 → Truco (3) → Seis (6) → Nove (9) → Doze (12) and stops', () => {
    expect(BASE_HAND_VALUE).toBe(1);
    expect(TRUCO_LADDER).toEqual([3, 6, 9, 12]);
    expect(nextStake(1)).toBe(3);
    expect(nextStake(3)).toBe(6);
    expect(nextStake(6)).toBe(9);
    expect(nextStake(9)).toBe(12);
    expect(nextStake(12)).toBeNull();
  });

  it('a hand starts worth 1 with no call pending', () => {
    const s = fresh(2);
    expect(s.value).toBe(1);
    expect(s.truco).toBeNull();
    expect(s.raisedBy).toBeNull();
    expect(s.ranBy).toBeNull();
  });
});

describe('callTruco', () => {
  it('lets the player on turn call, proposing 3 points', () => {
    const s = call(fresh(2), 0);
    expect(s.truco).toEqual({ caller: 0, team: 0, stake: 3 });
    expect(s.value).toBe(1);
    expect(s.turn).toBe(0);
  });

  it('rejects a call out of turn', () => {
    expect(callTruco(fresh(2), 1)).toEqual({ ok: false, error: 'not_your_turn' });
    expect(callTruco(fresh(4), 2)).toEqual({ ok: false, error: 'not_your_turn' });
  });

  it('can be called mid-trick, on any later turn', () => {
    const s = play(fresh(4), 0, '3c');
    expect(callTruco(s, 0)).toEqual({ ok: false, error: 'not_your_turn' });
    expect(call(s, 1).truco).toEqual({ caller: 1, team: 1, stake: 3 });
  });

  it('rejects a second call while one is pending', () => {
    const s = call(fresh(2), 0);
    expect(callTruco(s, 0)).toEqual({ ok: false, error: 'truco_pending' });
  });

  it('rejects a call once the hand is over', () => {
    const s = answer(call(fresh(2), 0), 1, 'run');
    expect(callTruco(s, 0)).toEqual({ ok: false, error: 'hand_over' });
  });

  it('throws on a seat outside the table', () => {
    expect(() => callTruco(fresh(2), 2)).toThrow();
  });
});

describe('answering a call', () => {
  it('accept: the hand is worth the stake and play resumes with the caller', () => {
    const s = answer(call(fresh(2), 0), 1, 'accept');
    expect(s.value).toBe(3);
    expect(s.truco).toBeNull();
    expect(s.raisedBy).toBe(0);
    expect(s.turn).toBe(0);
    expect(s.winner).toBeNull();
    expect(playCard(s, 0, '3c').ok).toBe(true);
  });

  it('run: the calling team wins the hand at its value before the call (1 for truco)', () => {
    const s = answer(call(fresh(2), 0), 1, 'run');
    expect(s.winner).toBe(0);
    expect(s.value).toBe(1);
    expect(s.ranBy).toBe(1);
    expect(s.turn).toBeNull();
    expect(s.truco).toBeNull();
    expect(playCard(s, 0, '3c')).toEqual({ ok: false, error: 'hand_over' });
  });

  it('run from a later step scores the previous step (running from Seis gives 3)', () => {
    let s = answer(call(fresh(2), 0), 1, 'accept');
    s = play(s, 0, '3c');
    s = call(s, 1);
    expect(s.truco?.stake).toBe(6);
    s = answer(s, 0, 'run');
    expect(s.winner).toBe(1);
    expect(s.value).toBe(3);
    expect(s.ranBy).toBe(0);
  });

  it('raise: accepts the call and proposes the next step to the other team', () => {
    const s = answer(call(fresh(2), 0), 1, 'raise');
    expect(s.value).toBe(3);
    expect(s.truco).toEqual({ caller: 1, team: 1, stake: 6 });
    expect(s.turn).toBe(0);
    // The raiser's team cannot answer its own raise; the original caller must.
    expect(respondTruco(s, 1, 'accept')).toEqual({ ok: false, error: 'not_your_team_to_answer' });
    expect(answer(s, 0, 'accept').value).toBe(6);
  });

  it('running from a raise gives the raiser the value already accepted', () => {
    const s = answer(answer(call(fresh(2), 0), 1, 'raise'), 0, 'run');
    expect(s.winner).toBe(1);
    expect(s.value).toBe(3);
    expect(s.ranBy).toBe(0);
  });

  it('raises can bounce all the way up to Doze, and no further', () => {
    let s = call(fresh(2), 0); // Truco
    s = answer(s, 1, 'raise'); // Seis
    s = answer(s, 0, 'raise'); // Nove
    s = answer(s, 1, 'raise'); // Doze
    expect(s.value).toBe(9);
    expect(s.truco).toEqual({ caller: 1, team: 1, stake: 12 });
    expect(respondTruco(s, 0, 'raise')).toEqual({ ok: false, error: 'ladder_maxed' });
    s = answer(s, 0, 'accept');
    expect(s.value).toBe(12);
    expect(s.raisedBy).toBe(1);
    // Even the team that did not raise last (team 0, on turn) cannot go past Doze.
    expect(s.turn).toBe(0);
    expect(callTruco(s, 0)).toEqual({ ok: false, error: 'ladder_maxed' });
  });

  it('running from Doze scores 9', () => {
    let s = call(fresh(2), 0);
    s = answer(s, 1, 'raise');
    s = answer(s, 0, 'raise');
    s = answer(s, 1, 'raise');
    s = answer(s, 0, 'run');
    expect(s.winner).toBe(1);
    expect(s.value).toBe(9);
  });

  it('the calling team cannot answer its own call', () => {
    expect(respondTruco(call(fresh(2), 0), 0, 'accept')).toEqual({
      ok: false,
      error: 'not_your_team_to_answer',
    });
    // Nor can the caller's partner.
    expect(respondTruco(call(fresh(4), 0), 2, 'run')).toEqual({
      ok: false,
      error: 'not_your_team_to_answer',
    });
  });

  it('rejects an answer with no call pending', () => {
    expect(respondTruco(fresh(2), 1, 'accept')).toEqual({ ok: false, error: 'no_truco_pending' });
  });

  it('rejects an answer once the hand is over', () => {
    const s = answer(call(fresh(2), 0), 1, 'run');
    expect(respondTruco(s, 1, 'accept')).toEqual({ ok: false, error: 'hand_over' });
  });
});

describe('who may raise', () => {
  it('the team that made the latest raise cannot raise again', () => {
    let s = answer(call(fresh(2), 0), 1, 'accept');
    s = play(s, 0, '3c');
    s = play(s, 1, '2c'); // seat 0 takes trick 1 and leads again
    expect(s.turn).toBe(0);
    expect(callTruco(s, 0)).toEqual({ ok: false, error: 'not_your_team_to_raise' });
  });

  it('after a raise is accepted, the turn passes back to the team that answered', () => {
    let s = answer(call(fresh(2), 0), 1, 'accept'); // team 0 raised to 3
    s = play(s, 0, '3c');
    s = answer(call(s, 1), 0, 'accept'); // team 1 raised to 6
    expect(s.value).toBe(6);
    expect(s.raisedBy).toBe(1);
    expect(callTruco(s, 1)).toEqual({ ok: false, error: 'not_your_team_to_raise' });
    s = play(s, 1, '2c'); // seat 0 takes trick 1
    expect(call(s, 0).truco).toEqual({ caller: 0, team: 0, stake: 9 });
  });

  it('in 4 players the caller’s partner cannot raise either', () => {
    let s = answer(call(fresh(4), 0), 1, 'accept');
    s = play(s, 0, '4c');
    s = play(s, 1, '4h');
    expect(s.turn).toBe(2);
    expect(callTruco(s, 2)).toEqual({ ok: false, error: 'not_your_team_to_raise' });
    s = play(s, 2, '4s');
    expect(call(s, 3).truco).toEqual({ caller: 3, team: 1, stake: 6 });
  });

  it('after a raise, the raiser’s team is the one that cannot raise', () => {
    let s = answer(call(fresh(2), 0), 1, 'raise'); // team 1 proposes 6
    s = answer(s, 0, 'accept');
    expect(s.raisedBy).toBe(1);
    expect(callTruco(s, 0).ok).toBe(true);
  });
});

describe('answering team in 4 and 6 players', () => {
  it.each([
    [4, [1, 3]],
    [6, [1, 3, 5]],
  ] as const)('%i players: any opponent of the caller may answer', (mode, opponents) => {
    for (const seat of opponents) {
      const s = answer(call(fresh(mode), 0), seat, 'accept');
      expect(s.value).toBe(3);
    }
  });

  it('the first answer wins: a later answer from a teammate is rejected', () => {
    const s = answer(call(fresh(6), 0), 3, 'accept');
    expect(respondTruco(s, 5, 'run')).toEqual({ ok: false, error: 'no_truco_pending' });
    expect(s.value).toBe(3);
  });

  it('after a raise, any member of the original calling team may answer', () => {
    const s = answer(call(fresh(6), 0), 5, 'raise');
    expect(s.truco).toEqual({ caller: 5, team: 1, stake: 6 });
    const accepted = answer(s, 4, 'accept');
    expect(accepted.value).toBe(6);
    expect(accepted.raisedBy).toBe(1);
  });
});

describe('cards and the truco call', () => {
  it('no card may be played while a call is pending', () => {
    const s = call(fresh(2), 0);
    expect(playCard(s, 0, '3c')).toEqual({ ok: false, error: 'truco_pending' });
  });

  it('an accepted truco is kept through the tricks: the winner scores the raised value', () => {
    let s = answer(call(fresh(2), 0), 1, 'accept');
    s = play(s, 0, '3c');
    s = play(s, 1, '4h'); // seat 0 takes trick 1
    s = play(s, 0, '5c');
    s = play(s, 1, '2c'); // seat 1 takes trick 2
    s = play(s, 1, '5h');
    s = play(s, 0, '4c'); // seat 1 takes trick 3
    expect(s.winner).toBe(1);
    expect(s.value).toBe(3);
    expect(s.ranBy).toBeNull();
  });
});
