import type { GameMode, Seat, Team } from '../shared/types.js';

/**
 * Seating, teams and turn order.
 *
 * Seats are numbered counter-clockwise around the table, which is the
 * direction of play in Truco Paulista. So "the next player" is always
 * `seat + 1` (wrapping), and the player to someone's right is the next one.
 *
 * Teams are fixed by seat parity, which gives the traditional layouts for
 * free: 1v1 in 2 players, partners opposite each other in 4, and teams
 * alternating A,B,A,B,A,B in 6. Teammates never sit next to each other.
 */

export const GAME_MODES: readonly GameMode[] = [2, 4, 6];

export function isGameMode(value: unknown): value is GameMode {
  return GAME_MODES.includes(value as GameMode);
}

/** All seats of a mode, in counter-clockwise order starting from seat 0. */
export function seatsOf(mode: GameMode): Seat[] {
  return Array.from({ length: mode }, (_, seat) => seat);
}

/** Throws unless `seat` is an integer in `[0, mode)`. */
export function assertSeat(seat: Seat, mode: GameMode): void {
  if (!Number.isInteger(seat) || seat < 0 || seat >= mode) {
    throw new Error(`Invalid seat ${seat} for a ${mode}-player game`);
  }
}

/** Team of a seat: even seats are team 0, odd seats team 1. */
export function teamOf(seat: Seat): Team {
  if (!Number.isInteger(seat) || seat < 0) throw new Error(`Invalid seat ${seat}`);
  return seat % 2 === 0 ? 0 : 1;
}

/** Seats of a team, in counter-clockwise order. */
export function seatsOfTeam(team: Team, mode: GameMode): Seat[] {
  return seatsOf(mode).filter((seat) => teamOf(seat) === team);
}

/** The other seats on the same team (none in a 2-player game). */
export function partnersOf(seat: Seat, mode: GameMode): Seat[] {
  assertSeat(seat, mode);
  return seatsOfTeam(teamOf(seat), mode).filter((s) => s !== seat);
}

/** The seat that plays after `seat` (counter-clockwise, wrapping). */
export function nextSeat(seat: Seat, mode: GameMode): Seat {
  assertSeat(seat, mode);
  return (seat + 1) % mode;
}

/** Every seat once, in playing order, starting with `leader`. */
export function turnOrder(leader: Seat, mode: GameMode): Seat[] {
  assertSeat(leader, mode);
  return seatsOf(mode).map((i) => (leader + i) % mode);
}

/**
 * The *mão*: the player to the dealer's right, who leads the first trick and
 * wins a hand where every trick is tied. Always on the other team from the
 * dealer.
 */
export function maoSeat(dealer: Seat, mode: GameMode): Seat {
  return nextSeat(dealer, mode);
}

/** The deal passes counter-clockwise: this hand's mão deals the next one. */
export function nextDealer(dealer: Seat, mode: GameMode): Seat {
  return nextSeat(dealer, mode);
}
