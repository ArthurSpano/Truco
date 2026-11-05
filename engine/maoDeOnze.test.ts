import { describe, expect, it } from 'vitest';
import type { Card, CardId, GameMode, Rank, Seat, Suit, Team } from '../shared/types.js';
import { makeCard } from './deck.js';
import { dealHand, playCard, startHand, type HandState } from './hand.js';
import {
  MAO_DE_ONZE_RUN_VALUE,
  MAO_DE_ONZE_SCORE,
  MAO_DE_ONZE_VALUE,
  decideMaoDeOnze,
  handsVisibleTo,
  maoDeOnzeTeam,
} from './maoDeOnze.js';
import { seedRng } from './rng.js';
import { seatsOf } from './seating.js';
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

/** A fresh hand where seat 0 is the mão (the last seat deals), optionally a mão de onze. */
function fresh(mode: GameMode, maoDeOnze?: Team): HandState {
  return startHand(
    mode,
    mode - 1,
    HANDS.slice(0, mode).map((ids) => ids.map(c)),
    VIRA,
    maoDeOnze === undefined ? {} : { maoDeOnze },
  );
}

function ok(result: { ok: true; state: HandState } | { ok: false; error: string }): HandState {
  if (!result.ok) throw new Error(`Unexpected rejection: ${result.error}`);
  return result.state;
}

const decide = (s: HandState, seat: Seat, play: boolean): HandState =>
  ok(decideMaoDeOnze(s, seat, play));

/** Plays each card in turn, whoever's turn it is. */
function playAll(state: HandState, ...ids: CardId[]): HandState {
  let s = state;
  for (const id of ids) {
    if (s.turn === null) throw new Error(`Hand already over before playing ${id}`);
    s = ok(playCard(s, s.turn, id));
  }
  return s;
}

describe('constants', () => {
  it('a mão de onze is played at 11, worth 3, and running gives the opponents 1', () => {
    expect(MAO_DE_ONZE_SCORE).toBe(11);
    expect(MAO_DE_ONZE_VALUE).toBe(3);
    expect(MAO_DE_ONZE_RUN_VALUE).toBe(1);
  });
});

describe('maoDeOnzeTeam', () => {
  it('is the team at 11 when only one team is there', () => {
    expect(maoDeOnzeTeam([11, 0])).toBe(0);
    expect(maoDeOnzeTeam([11, 10])).toBe(0);
    expect(maoDeOnzeTeam([4, 11])).toBe(1);
  });

  it('is null when nobody is at 11', () => {
    expect(maoDeOnzeTeam([0, 0])).toBeNull();
    expect(maoDeOnzeTeam([10, 10])).toBeNull();
  });

  it('is null when both teams are at 11 (that is a mão de ferro)', () => {
    expect(maoDeOnzeTeam([11, 11])).toBeNull();
  });
});

describe('starting a mão de onze', () => {
  it('ordinary hands have no mão de onze', () => {
    expect(fresh(2).maoDeOnze).toBeNull();
  });

  it.each([0, 1] as const)('team %i at 11: the decision is pending, hand still worth 1', (team) => {
    const s = fresh(4, team);
    expect(s.maoDeOnze).toEqual({ team, decision: 'pending' });
    expect(s.value).toBe(1);
    expect(s.turn).toBe(0);
    expect(s.winner).toBeNull();
  });

  it('dealHand passes the option through', () => {
    const [plain] = dealHand(2, 0, seedRng(3));
    const [onze] = dealHand(2, 0, seedRng(3), { maoDeOnze: 1 });
    expect(plain.maoDeOnze).toBeNull();
    expect(onze.maoDeOnze).toEqual({ team: 1, decision: 'pending' });
    expect(onze.hands).toEqual(plain.hands);
  });
});

describe('while the decision is pending', () => {
  it('nobody may play a card', () => {
    const s = fresh(4, 0);
    expect(playCard(s, 0, '3c')).toEqual({ ok: false, error: 'mao_de_onze_pending' });
    expect(playCard(s, 1, '2c')).toEqual({ ok: false, error: 'mao_de_onze_pending' });
  });

  it('nobody may call truco', () => {
    expect(callTruco(fresh(2, 1), 0)).toEqual({ ok: false, error: 'truco_not_allowed' });
  });
});

describe('decideMaoDeOnze', () => {
  it('playing makes the hand worth 3 and play starts with the mão', () => {
    const s = decide(fresh(2, 0), 0, true);
    expect(s.maoDeOnze).toEqual({ team: 0, decision: 'play' });
    expect(s.value).toBe(MAO_DE_ONZE_VALUE);
    expect(s.turn).toBe(0);
    expect(s.winner).toBeNull();
    expect(playCard(s, 0, '3c').ok).toBe(true);
  });

  it('the team at 11 wins 3 points by winning the hand', () => {
    // Seat 0's 3 beats seat 1's 2, then the 4s tie: the trick-1 winner takes the hand.
    const s = playAll(decide(fresh(2, 0), 0, true), '3c', '2c', '4c', '4h');
    expect(s.winner).toBe(0);
    expect(s.value).toBe(3);
    expect(s.ranBy).toBeNull();
  });

  it('the opponents win 3 points if the team at 11 plays and loses', () => {
    // Team 1 is at 11 and loses: seat 0 holds the stronger cards.
    const s = playAll(decide(fresh(2, 1), 1, true), '3c', '2c', '4c', '4h');
    expect(s.winner).toBe(0);
    expect(s.value).toBe(3);
  });

  it('running ends the hand at once, giving the opponents 1 point', () => {
    const s = decide(fresh(2, 0), 0, false);
    expect(s.maoDeOnze).toEqual({ team: 0, decision: 'run' });
    expect(s.winner).toBe(1);
    expect(s.value).toBe(MAO_DE_ONZE_RUN_VALUE);
    expect(s.ranBy).toBe(0);
    expect(s.turn).toBeNull();
    expect(playCard(s, 0, '3c')).toEqual({ ok: false, error: 'hand_over' });
  });

  it('the team at 11 may run even when it is not the mão', () => {
    const s = decide(fresh(4, 1), 3, false);
    expect(s.winner).toBe(0);
    expect(s.value).toBe(1);
    expect(s.ranBy).toBe(1);
  });

  it.each([
    [4, 2],
    [6, 4],
    [6, 2],
  ] as const)('%i players: any member of the team at 11 may decide (seat %i)', (mode, seat) => {
    expect(decide(fresh(mode, 0), seat, true).maoDeOnze?.decision).toBe('play');
  });

  it('the first decision counts', () => {
    const s = decide(fresh(4, 0), 2, true);
    expect(decideMaoDeOnze(s, 0, false)).toEqual({ ok: false, error: 'no_decision_pending' });
  });

  it('only the team at 11 decides', () => {
    for (const seat of [1, 3, 5]) {
      expect(decideMaoDeOnze(fresh(6, 0), seat, true)).toEqual({
        ok: false,
        error: 'not_your_team_to_decide',
      });
    }
  });

  it('is rejected in an ordinary hand', () => {
    expect(decideMaoDeOnze(fresh(2), 0, true)).toEqual({
      ok: false,
      error: 'no_decision_pending',
    });
  });

  it('is rejected once the hand is over', () => {
    const s = decide(fresh(2, 0), 0, false);
    expect(decideMaoDeOnze(s, 0, true)).toEqual({ ok: false, error: 'hand_over' });
  });

  it('rejects a non-boolean decision from unvalidated input', () => {
    const play = 'yes' as unknown as boolean;
    expect(decideMaoDeOnze(fresh(2, 0), 0, play)).toEqual({
      ok: false,
      error: 'invalid_decision',
    });
  });

  it('throws on a seat outside the table', () => {
    expect(() => decideMaoDeOnze(fresh(2, 0), 2, true)).toThrow(/Invalid seat/);
  });
});

describe('no truco in a mão de onze', () => {
  it('neither team may call truco after deciding to play', () => {
    const s = decide(fresh(2, 0), 0, true);
    expect(callTruco(s, 0)).toEqual({ ok: false, error: 'truco_not_allowed' });
    const afterLead = playAll(s, '3c');
    expect(callTruco(afterLead, 1)).toEqual({ ok: false, error: 'truco_not_allowed' });
  });

  it('ordinary hands still allow truco', () => {
    expect(callTruco(fresh(2), 0).ok).toBe(true);
  });
});

describe('handsVisibleTo', () => {
  it('in an ordinary hand everyone sees only their own cards', () => {
    const s = fresh(6);
    for (const seat of seatsOf(6)) expect(handsVisibleTo(s, seat)).toEqual([seat]);
  });

  it('4 players: the team at 11 sees its partners’ cards while deciding', () => {
    const s = fresh(4, 0);
    expect(handsVisibleTo(s, 0)).toEqual([0, 2]);
    expect(handsVisibleTo(s, 2)).toEqual([0, 2]);
    expect(handsVisibleTo(s, 1)).toEqual([1]);
    expect(handsVisibleTo(s, 3)).toEqual([3]);
  });

  it('6 players: all three members of the team at 11 see each other', () => {
    const s = fresh(6, 1);
    for (const seat of [1, 3, 5]) expect(handsVisibleTo(s, seat)).toEqual([1, 3, 5]);
    for (const seat of [0, 2, 4]) expect(handsVisibleTo(s, seat)).toEqual([seat]);
  });

  it('2 players: there is no partner, so only your own cards', () => {
    const s = fresh(2, 0);
    expect(handsVisibleTo(s, 0)).toEqual([0]);
    expect(handsVisibleTo(s, 1)).toEqual([1]);
  });

  it('partners’ cards are hidden again once the team has decided', () => {
    const s = decide(fresh(4, 0), 0, true);
    expect(handsVisibleTo(s, 0)).toEqual([0]);
    expect(handsVisibleTo(s, 2)).toEqual([2]);
  });

  it('throws on a seat outside the table', () => {
    expect(() => handsVisibleTo(fresh(4, 0), 4)).toThrow(/Invalid seat/);
  });
});
