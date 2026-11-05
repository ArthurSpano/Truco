import type { Card, Seat, Team } from '../shared/types.js';
import { compareCards } from './deck.js';
import { teamOf } from './seating.js';

/**
 * Trick and hand resolution. Pure functions over plain data: who takes a
 * trick, and when a best-of-3 hand is decided (including every tie case).
 */

/** One card played to a trick. */
export interface TrickPlay {
  seat: Seat;
  card: Card;
}

/** Tricks per hand: a hand is best of 3. */
export const TRICKS_PER_HAND = 3;

/** The team that took a trick, or `null` when it was tied (*empate* / *embuchada*). */
export type TrickWinner = Team | null;

export interface TrickResult {
  winner: TrickWinner;
  /**
   * Who leads the next trick: the player of the winning card. On a tie, the
   * first player (in playing order) to lay one of the tied top cards.
   */
  leader: Seat;
}

/**
 * Resolves a complete trick. The highest card takes it. Only the top cards
 * matter for ties: if they all belong to one team (e.g. two partners both
 * play a 3), that team takes the trick; if both teams share the top, the
 * trick is tied.
 *
 * `plays` must be in playing order; it is not otherwise validated here (the
 * hand state machine guarantees one card per seat).
 */
export function resolveTrick(plays: readonly TrickPlay[], vira: Card): TrickResult {
  const [first, ...rest] = plays;
  if (first === undefined) throw new Error('Cannot resolve an empty trick');

  // `best` only changes on a strictly higher card, so on a tie it stays the
  // first of the tied top cards.
  let best = first;
  let top: TrickPlay[] = [first];
  for (const play of rest) {
    const diff = compareCards(play.card, best.card, vira);
    if (diff > 0) {
      best = play;
      top = [play];
    } else if (diff === 0) {
      top.push(play);
    }
  }

  const teams = new Set(top.map((p) => teamOf(p.seat)));
  return { winner: teams.size === 1 ? teamOf(best.seat) : null, leader: best.seat };
}

/**
 * Decides a hand from the trick results so far (oldest first). Returns the
 * winning team, or `null` if more tricks are needed.
 *
 * - Two trick wins take the hand.
 * - Trick 1 tied: the next trick won decides it; all three tied → the *mão*'s team.
 * - Trick 1 won, trick 2 tied → the trick-1 winner.
 * - 1-1 and trick 3 tied → the trick-1 winner.
 *
 * So a hand can end after 2 tricks (2-0, or a tie plus a win in either order).
 */
export function handWinner(tricks: readonly TrickWinner[], maoTeam: Team): Team | null {
  if (tricks.length > TRICKS_PER_HAND) {
    throw new Error(`A hand has at most ${TRICKS_PER_HAND} tricks, got ${tricks.length}`);
  }
  const [t1, t2, t3] = tricks;
  if (t1 === undefined || t2 === undefined) return null;

  if (t1 === null) {
    // Tied first trick: whoever wins a later trick takes the hand.
    if (t2 !== null) return t2;
    if (t3 === undefined) return null;
    return t3 ?? maoTeam;
  }

  // Trick 1 was won: winning trick 2 too, or tying it, settles the hand.
  if (t2 === null || t2 === t1) return t1;
  // 1-1: trick 3 decides, and a tie there goes to the trick-1 winner.
  if (t3 === undefined) return null;
  return t3 ?? t1;
}
