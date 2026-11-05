import type { GameMode, Team } from '../shared/types.js';
import { RULES } from './config.js';
import { dealHand, type HandOptions, type HandState } from './hand.js';
import { isMaoDeFerro } from './maoDeFerro.js';
import { maoDeOnzeTeam } from './maoDeOnze.js';
import type { RngState } from './rng.js';
import { firstDealer, nextDealer } from './seating.js';

/**
 * A match: hands are dealt one after another, each decided hand adds its
 * value to the winning team's score, and the first team to reach 12 points
 * wins the match. The score decides what kind of hand comes next: a normal
 * one, a mão de onze (one team at 11) or a mão de ferro (both at 11).
 *
 * Scores are capped at 12: a team at 10 winning a truco (3 points) ends the
 * match at 12, not 13, since nothing beyond 12 means anything. The target
 * score is `RULES.winningScore` (see config.ts).
 */

/** Match score, indexed by team. */
export type Scores = readonly [number, number];

export interface MatchState {
  readonly mode: GameMode;
  readonly scores: Scores;
  /** The hand being played, or the last hand played once the match is over. */
  readonly hand: HandState;
  /** 1-based number of the current hand. */
  readonly handNumber: number;
  /** Team that reached 12 points, or `null` while the match goes on. */
  readonly winner: Team | null;
  /** Hidden information: it determines every future deal. Never send it to clients. */
  readonly rng: RngState;
}

/** The team that has won given `scores`, or `null` if nobody has reached 12 yet. */
export function matchWinner(scores: Scores): Team | null {
  if (scores[0] >= RULES.winningScore) return 0;
  if (scores[1] >= RULES.winningScore) return 1;
  return null;
}

/** Adds `points` to `team`'s score, capped at 12. */
export function addPoints(scores: Scores, team: Team, points: number): Scores {
  if (!Number.isInteger(points) || points < 0) throw new Error(`Invalid points ${points}`);
  const added = Math.min(scores[team] + points, RULES.winningScore);
  return team === 0 ? [added, scores[1]] : [scores[0], added];
}

/** The kind of hand `scores` calls for: mão de ferro, mão de onze, or a normal hand. */
export function handOptionsFor(scores: Scores): HandOptions {
  if (isMaoDeFerro(scores)) return { maoDeFerro: true };
  const onze = maoDeOnzeTeam(scores);
  return onze === null ? {} : { maoDeOnze: onze };
}

/** Starts a match at 0 x 0: draws the first dealer and deals the first hand. */
export function startMatch(mode: GameMode, rng: RngState): MatchState {
  const [dealer, afterDraw] = firstDealer(mode, rng);
  const scores: Scores = [0, 0];
  const [hand, next] = dealHand(mode, dealer, afterDraw, handOptionsFor(scores));
  return { mode, scores, hand, handNumber: 1, winner: null, rng: next };
}

export type MatchError = 'match_over' | 'hand_in_progress';

export type MatchResult = { ok: true; state: MatchState } | { ok: false; error: MatchError };

/**
 * Scores the current hand once it is decided. If that brings a team to 12
 * the match is over: `winner` is set and the last hand is kept for display.
 * Otherwise the deal rotates and the next hand is dealt, as a mão de onze or
 * mão de ferro when the new score calls for one. Rejects while the hand is
 * still being played and once the match is over.
 */
export function finishHand(match: MatchState): MatchResult {
  if (match.winner !== null) return { ok: false, error: 'match_over' };
  const { hand } = match;
  if (hand.winner === null) return { ok: false, error: 'hand_in_progress' };

  const scores = addPoints(match.scores, hand.winner, hand.value);
  const winner = matchWinner(scores);
  if (winner !== null) return { ok: true, state: { ...match, scores, winner } };

  const dealer = nextDealer(hand.dealer, match.mode);
  const [next, rng] = dealHand(match.mode, dealer, match.rng, handOptionsFor(scores));
  return {
    ok: true,
    state: { ...match, scores, hand: next, handNumber: match.handNumber + 1, rng },
  };
}
