import type { Seat, Team } from '../shared/types.js';
import type { HandState } from './hand.js';
import { assertSeat, teamOf } from './seating.js';

/**
 * The truco ladder: raising the value of the hand in play.
 *
 * A hand starts worth 1 point. On their turn, a player may call *Truco*
 * (3); the other team then answers:
 *
 * - **accept**: the hand is now worth the called value and play resumes;
 * - **run** (*correr*): the hand ends at once, won by the calling team, worth
 *   the value it had *before* the call (1 for a first truco);
 * - **raise**: accepts the call and raises to the next step (*Seis*, then
 *   *Nove*, then *Doze*), which the first team must answer in turn.
 *
 * The team that made the latest accepted raise cannot raise again: only the
 * other team may call the next step, on one of its players' turns. In 4 and
 * 6 player games any member of the answering team may answer; the first
 * answer counts.
 */

/** What a hand is worth before anyone calls truco. */
export const BASE_HAND_VALUE = 1;

/** Values a hand can be raised to, in order: Truco, Seis, Nove, Doze. */
export const TRUCO_LADDER: readonly number[] = [3, 6, 9, 12];

/** The next value up the ladder from `value`, or `null` at the top (Doze). */
export function nextStake(value: number): number | null {
  return TRUCO_LADDER.find((stake) => stake > value) ?? null;
}

/** A truco call (or raise) waiting for the other team's answer. */
export interface TrucoCall {
  /** Seat that made the call or the latest raise. */
  readonly caller: Seat;
  /** The caller's team. Any player of the other team may answer. */
  readonly team: Team;
  /** What the hand will be worth if the call is accepted. */
  readonly stake: number;
}

export type TrucoAnswer = 'accept' | 'run' | 'raise';

export type TrucoError =
  | 'hand_over'
  | 'not_your_turn'
  | 'truco_pending'
  | 'no_truco_pending'
  | 'not_your_team_to_raise'
  | 'not_your_team_to_answer'
  | 'ladder_maxed';

export type TrucoResult = { ok: true; state: HandState } | { ok: false; error: TrucoError };

/**
 * `seat` calls truco, or the next step of the ladder. Allowed only on the
 * caller's turn, while no other call is pending, if the caller's team did not
 * make the latest raise and the hand is not already worth Doze.
 */
export function callTruco(state: HandState, seat: Seat): TrucoResult {
  assertSeat(seat, state.mode);
  if (state.winner !== null || state.turn === null) return { ok: false, error: 'hand_over' };
  if (state.truco !== null) return { ok: false, error: 'truco_pending' };
  if (seat !== state.turn) return { ok: false, error: 'not_your_turn' };

  const team = teamOf(seat);
  if (state.raisedBy === team) return { ok: false, error: 'not_your_team_to_raise' };
  const stake = nextStake(state.value);
  if (stake === null) return { ok: false, error: 'ladder_maxed' };

  return { ok: true, state: { ...state, truco: { caller: seat, team, stake } } };
}

/**
 * A player of the answering team answers the pending call. See the module
 * comment for what each answer does. A raise flips the call around: the
 * raiser's team becomes the caller and the other team must answer next.
 */
export function respondTruco(state: HandState, seat: Seat, answer: TrucoAnswer): TrucoResult {
  assertSeat(seat, state.mode);
  if (state.winner !== null || state.turn === null) return { ok: false, error: 'hand_over' };
  const call = state.truco;
  if (call === null) return { ok: false, error: 'no_truco_pending' };
  const team = teamOf(seat);
  if (team === call.team) return { ok: false, error: 'not_your_team_to_answer' };

  switch (answer) {
    case 'accept':
      return {
        ok: true,
        state: { ...state, value: call.stake, raisedBy: call.team, truco: null },
      };
    case 'run':
      return {
        ok: true,
        state: { ...state, truco: null, turn: null, winner: call.team, ranBy: team },
      };
    case 'raise': {
      const stake = nextStake(call.stake);
      if (stake === null) return { ok: false, error: 'ladder_maxed' };
      return {
        ok: true,
        state: {
          ...state,
          value: call.stake,
          raisedBy: call.team,
          truco: { caller: seat, team, stake },
        },
      };
    }
  }
}
