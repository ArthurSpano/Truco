import { describe, expect, it } from 'vitest';
import type { Card, CardId, GameMode, Rank, Suit } from '../shared/types.js';
import { makeCard } from './deck.js';
import { playBlind, playCard, startHand, type HandOptions, type HandState } from './hand.js';
import { decideMaoDeOnze } from './maoDeOnze.js';
import {
  WINNING_SCORE,
  addPoints,
  finishHand,
  handOptionsFor,
  matchWinner,
  startMatch,
  type MatchResult,
  type MatchState,
  type Scores,
} from './match.js';
import { seedRng } from './rng.js';
import { seatsOfTeam } from './seating.js';
import { callTruco, respondTruco } from './truco.js';

const SUIT_BY_CODE: Record<string, Suit> = { c: 'clubs', h: 'hearts', s: 'spades', d: 'diamonds' };

function c(id: CardId): Card {
  return makeCard(id[0] as Rank, SUIT_BY_CODE[id[1] ?? ''] as Suit);
}

// Vira 7 → manilha Q.
const VIRA = c('7d');

/**
 * Six disjoint non-manilha hands, enough for any mode. Playing each seat's
 * first card makes team 0 win trick 1 (3 beats 2) and tie trick 2, so team 0
 * wins the hand.
 */
const HANDS: CardId[][] = [
  ['3c', '4c', '5c'],
  ['2c', '4h', '5h'],
  ['3h', '4s', '5s'],
  ['2h', '4d', '5d'],
  ['3s', '6c', '6h'],
  ['2s', '6s', '6d'],
];

/** A match at `scores` with a fresh fixed hand where seat 0 is the mão (the last seat deals). */
function matchAt(mode: GameMode, scores: Scores, options: HandOptions = {}): MatchState {
  const hand = startHand(
    mode,
    mode - 1,
    HANDS.slice(0, mode).map((ids) => ids.map(c)),
    VIRA,
    options,
  );
  return { mode, scores, hand, handNumber: 1, winner: null, rng: seedRng(1) };
}

function ok<S>(result: { ok: true; state: S } | { ok: false; error: string }): S {
  if (!result.ok) throw new Error(`Unexpected rejection: ${result.error}`);
  return result.state;
}

/**
 * Plays the hand to the end with every player playing their first card (blind
 * in a mão de ferro); a pending mão de onze is played, not run.
 */
function playOut(hand: HandState): HandState {
  let s = hand;
  while (s.turn !== null) {
    if (s.maoDeOnze?.decision === 'pending') {
      s = ok(decideMaoDeOnze(s, seatsOfTeam(s.maoDeOnze.team, s.mode)[0] ?? 0, true));
    } else if (s.maoDeFerro) {
      s = ok(playBlind(s, s.turn, 0));
    } else {
      const card = s.hands[s.turn]?.[0];
      if (card === undefined) throw new Error(`Seat ${s.turn} has no card left`);
      s = ok(playCard(s, s.turn, card.id));
    }
  }
  return s;
}

const finish = (m: MatchState): MatchState => ok<MatchState>(finishHand(m));
const withHand = (m: MatchState, hand: HandState): MatchState => ({ ...m, hand });

describe('constants', () => {
  it('the match is won at 12 points', () => {
    expect(WINNING_SCORE).toBe(12);
  });
});

describe('matchWinner', () => {
  it('is null while both teams are below 12', () => {
    expect(matchWinner([0, 0])).toBeNull();
    expect(matchWinner([11, 11])).toBeNull();
    expect(matchWinner([11, 3])).toBeNull();
  });

  it('is the team that reached 12', () => {
    expect(matchWinner([12, 5])).toBe(0);
    expect(matchWinner([7, 12])).toBe(1);
  });
});

describe('addPoints', () => {
  it('adds to the given team only', () => {
    expect(addPoints([2, 5], 0, 3)).toEqual([5, 5]);
    expect(addPoints([2, 5], 1, 1)).toEqual([2, 6]);
  });

  it('caps the score at 12', () => {
    expect(addPoints([10, 4], 0, 3)).toEqual([12, 4]);
    expect(addPoints([0, 11], 1, 12)).toEqual([0, 12]);
  });

  it('rejects negative or fractional points', () => {
    expect(() => addPoints([0, 0], 0, -1)).toThrow();
    expect(() => addPoints([0, 0], 0, 1.5)).toThrow();
  });
});

describe('handOptionsFor', () => {
  it('is a normal hand below 11', () => {
    expect(handOptionsFor([0, 0])).toEqual({});
    expect(handOptionsFor([10, 10])).toEqual({});
  });

  it('is a mão de onze for the team at 11', () => {
    expect(handOptionsFor([11, 4])).toEqual({ maoDeOnze: 0 });
    expect(handOptionsFor([9, 11])).toEqual({ maoDeOnze: 1 });
  });

  it('is a mão de ferro when both teams are at 11', () => {
    expect(handOptionsFor([11, 11])).toEqual({ maoDeFerro: true });
  });
});

describe('startMatch', () => {
  it.each<GameMode>([2, 4, 6])('starts a %i-player match at 0 x 0 with a normal hand', (mode) => {
    const m = startMatch(mode, seedRng(42));
    expect(m.mode).toBe(mode);
    expect(m.scores).toEqual([0, 0]);
    expect(m.winner).toBeNull();
    expect(m.handNumber).toBe(1);
    expect(m.hand.mode).toBe(mode);
    expect(m.hand.hands).toHaveLength(mode);
    expect(m.hand.maoDeOnze).toBeNull();
    expect(m.hand.maoDeFerro).toBe(false);
  });

  it('is deterministic for a seed', () => {
    expect(startMatch(4, seedRng(7))).toEqual(startMatch(4, seedRng(7)));
  });
});

describe('finishHand', () => {
  it('rejects while the hand is still being played', () => {
    expect(finishHand(matchAt(2, [0, 0]))).toEqual({ ok: false, error: 'hand_in_progress' });
  });

  it('adds the hand value to the winning team and deals the next hand', () => {
    const m = matchAt(4, [3, 2]);
    const next = finish(withHand(m, playOut(m.hand)));
    expect(next.scores).toEqual([4, 2]);
    expect(next.winner).toBeNull();
    expect(next.handNumber).toBe(2);
    expect(next.hand.winner).toBeNull();
    expect(next.hand.tricks).toEqual([]);
    expect(next.hand.dealer).toBe(0); // the deal passes from seat 3 to seat 0
    expect(next.rng).not.toBe(m.rng);
  });

  it('scores an accepted truco at its stake', () => {
    const m = matchAt(2, [0, 0]);
    const trucado = ok(respondTruco(ok(callTruco(m.hand, 0)), 1, 'accept'));
    expect(finish(withHand(m, playOut(trucado))).scores).toEqual([3, 0]);
  });

  it('scores a run from truco at the value before the call', () => {
    const m = matchAt(2, [0, 0]);
    const ran = ok(respondTruco(ok(callTruco(m.hand, 0)), 1, 'run'));
    expect(finish(withHand(m, ran)).scores).toEqual([1, 0]);
  });

  it('deals a mão de onze when a team reaches 11', () => {
    const m = matchAt(2, [10, 4]);
    const next = finish(withHand(m, playOut(m.hand)));
    expect(next.scores).toEqual([11, 4]);
    expect(next.winner).toBeNull();
    expect(next.hand.maoDeOnze).toEqual({ team: 0, decision: 'pending' });
    expect(next.hand.maoDeFerro).toBe(false);
  });

  it('deals a mão de ferro when both teams reach 11', () => {
    // Team 0 at 11 runs from its mão de onze: team 1 scores 1 and joins it at 11.
    const m = matchAt(2, [11, 10], { maoDeOnze: 0 });
    const next = finish(withHand(m, ok(decideMaoDeOnze(m.hand, 0, false))));
    expect(next.scores).toEqual([11, 11]);
    expect(next.winner).toBeNull();
    expect(next.hand.maoDeFerro).toBe(true);
    expect(next.hand.maoDeOnze).toBeNull();
  });

  describe('win at 12', () => {
    it('ends the match when a 1-point hand brings a team from 11 to 12', () => {
      const m = matchAt(2, [11, 11], { maoDeFerro: true });
      const last = playOut(m.hand);
      const over = finish(withHand(m, last));
      expect(over.scores).toEqual([12, 11]);
      expect(over.winner).toBe(0);
      // The last hand is kept for display; no new hand is dealt.
      expect(over.hand).toBe(last);
      expect(over.handNumber).toBe(1);
      expect(over.rng).toBe(m.rng);
    });

    it('ends the match when a played mão de onze is won (3 points from 11, capped at 12)', () => {
      const m = matchAt(4, [11, 6], { maoDeOnze: 0 });
      const over = finish(withHand(m, playOut(m.hand)));
      expect(over.scores).toEqual([12, 6]);
      expect(over.winner).toBe(0);
    });

    it('caps the winning score at 12 when a truco overshoots it', () => {
      const m = matchAt(6, [10, 8]);
      const trucado = ok(respondTruco(ok(callTruco(m.hand, 0)), 3, 'accept'));
      const over = finish(withHand(m, playOut(trucado)));
      expect(over.scores).toEqual([12, 8]);
      expect(over.winner).toBe(0);
    });

    it('lets a team win from 0 with an accepted Doze', () => {
      const m = matchAt(2, [0, 9]);
      let hand = ok(callTruco(m.hand, 0)); // Truco
      hand = ok(respondTruco(hand, 1, 'raise')); // Seis
      hand = ok(respondTruco(hand, 0, 'raise')); // Nove
      hand = ok(respondTruco(hand, 1, 'raise')); // Doze
      hand = ok(respondTruco(hand, 0, 'accept'));
      expect(hand.value).toBe(12);
      const over = finish(withHand(m, playOut(hand)));
      expect(over.scores).toEqual([12, 9]);
      expect(over.winner).toBe(0);
    });

    it('can be won by the opponents of the team at 11 when it plays the mão de onze', () => {
      // Team 1 at 11 plays; team 0 (at 9) wins the hand, worth 3: 9 → 12.
      const m = matchAt(2, [9, 11], { maoDeOnze: 1 });
      const played = playOut(ok(decideMaoDeOnze(m.hand, 1, true)));
      const over = finish(withHand(m, played));
      expect(over.scores).toEqual([12, 11]);
      expect(over.winner).toBe(0);
    });

    it('rejects finishing a hand once the match is over', () => {
      const m = matchAt(2, [11, 11], { maoDeFerro: true });
      const over = finish(withHand(m, playOut(m.hand)));
      const again: MatchResult = finishHand(over);
      expect(again).toEqual({ ok: false, error: 'match_over' });
    });
  });
});

describe('full matches', () => {
  it.each<[GameMode, number]>([
    [2, 1],
    [2, 2],
    [4, 3],
    [4, 4],
    [6, 5],
    [6, 6],
  ])('a %i-player match (seed %i) ends with exactly one team at 12', (mode, seed) => {
    let m = startMatch(mode, seedRng(seed));
    let previous: Scores = m.scores;
    while (m.winner === null) {
      expect(m.handNumber).toBeLessThanOrEqual(23); // at least 1 point per hand
      m = finish(withHand(m, playOut(m.hand)));
      // Exactly one team scores each hand, and scores never go down.
      const gained = [m.scores[0] - previous[0], m.scores[1] - previous[1]];
      expect(gained.filter((g) => g > 0)).toHaveLength(1);
      expect(gained.every((g) => g >= 0)).toBe(true);
      previous = m.scores;
    }
    expect(Math.max(...m.scores)).toBe(WINNING_SCORE);
    expect(Math.min(...m.scores)).toBeLessThan(WINNING_SCORE);
    expect(m.scores[m.winner]).toBe(WINNING_SCORE);
    expect(finishHand(m)).toEqual({ ok: false, error: 'match_over' });
  });
});
