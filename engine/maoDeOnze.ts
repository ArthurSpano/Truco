import type { MaoDeOnzeDecision, Seat, Team } from '../shared/types.js';
import { RULES } from './config.js';
import type { HandState } from './hand.js';
import { assertSeat, seatsOfTeam, teamOf } from './seating.js';

/**
 * *Mão de onze*: the hand played when exactly one team has 11 points.
 *
 * Before any card is played, the players of the team at 11 look at each
 * other's cards (in a 2-player game, just their own) and decide:
 *
 * - **play**: the hand is worth 3 points to whoever wins it;
 * - **run**: the hand ends at once and the opponents score 1 point.
 *
 * No truco may be called during a mão de onze, by either team. In 4 and 6
 * player games any member of the team at 11 may decide; the first decision
 * counts. When both teams are at 11 the hand is a *mão de ferro* instead.
 *
 * The score (11) and both values are in `RULES` (see config.ts).
 */

export type { MaoDeOnzeDecision };

export interface MaoDeOnze {
  /** The team at 11, which decides whether to play the hand. */
  readonly team: Team;
  readonly decision: MaoDeOnzeDecision;
}

/**
 * The team that plays a mão de onze given the match score (indexed by team),
 * or `null` if nobody is at 11 or both are (a mão de ferro).
 */
export function maoDeOnzeTeam(scores: readonly [number, number]): Team | null {
  const [a, b] = scores;
  const onze = RULES.maoDeOnzeScore;
  if (a === onze && b !== onze) return 0;
  if (b === onze && a !== onze) return 1;
  return null;
}

export type MaoDeOnzeError =
  'hand_over' | 'no_decision_pending' | 'not_your_team_to_decide' | 'invalid_decision';

export type MaoDeOnzeResult = { ok: true; state: HandState } | { ok: false; error: MaoDeOnzeError };

/**
 * A player of the team at 11 decides whether to `play` the mão de onze
 * (hand worth 3) or run from it (hand over, opponents score 1).
 */
export function decideMaoDeOnze(state: HandState, seat: Seat, play: boolean): MaoDeOnzeResult {
  assertSeat(seat, state.mode);
  if (state.winner !== null || state.turn === null) return { ok: false, error: 'hand_over' };
  const onze = state.maoDeOnze;
  if (onze === null || onze.decision !== 'pending') {
    return { ok: false, error: 'no_decision_pending' };
  }
  if (teamOf(seat) !== onze.team) return { ok: false, error: 'not_your_team_to_decide' };
  // Guards against unvalidated runtime input, where a truthy string would read as "play".
  if (typeof play !== 'boolean') return { ok: false, error: 'invalid_decision' };

  if (play) {
    return {
      ok: true,
      state: { ...state, value: RULES.maoDeOnzeValue, maoDeOnze: { ...onze, decision: 'play' } },
    };
  }
  return {
    ok: true,
    state: {
      ...state,
      value: RULES.maoDeOnzeRunValue,
      turn: null,
      winner: onze.team === 0 ? 1 : 0,
      ranBy: onze.team,
      maoDeOnze: { ...onze, decision: 'run' },
    },
  };
}

/**
 * Seats whose hands `seat` may see, in seat order. Normally just its own;
 * while a mão de onze decision is pending, the team at 11 sees all of its
 * members' hands; in a mão de ferro nobody sees any hand, not even their own.
 * Everything else in `HandState.hands` is hidden information.
 */
export function handsVisibleTo(state: HandState, seat: Seat): Seat[] {
  assertSeat(seat, state.mode);
  if (state.maoDeFerro) return [];
  const onze = state.maoDeOnze;
  if (onze !== null && onze.decision === 'pending' && teamOf(seat) === onze.team) {
    return seatsOfTeam(onze.team, state.mode);
  }
  return [seat];
}
