import type { Card, Seat, TableCard, Team, TrickWinner } from '../shared/types.js';
import { RULES, type TieRules } from './config.js';
import { compareCards } from './deck.js';
import { teamOf } from './seating.js';

/**
 * Trick and hand resolution. Pure functions over plain data: who takes a
 * trick, and when a best-of-3 hand is decided (including every tie case).
 */

/** One card played to a trick. */
export interface TrickPlay {
  seat: Seat;
  /** The real card, even when played face down. Hidden information: see `tableCard`. */
  card: Card;
  /**
   * Played face down (*encoberta*): it loses to every face-up card and ties
   * with other face-down cards, whatever it really is.
   */
  faceDown: boolean;
}

/**
 * The public form of a play, safe to show every player: a face-down card
 * drops its identity.
 */
export function tableCard(play: TrickPlay): TableCard {
  return play.faceDown
    ? { seat: play.seat, faceDown: true }
    : { seat: play.seat, faceDown: false, card: play.card };
}

/**
 * Compares two plays: positive if `a` wins, negative if `b` wins, `0` on a
 * tie. Face-down cards rank below every face-up card and tie with each other.
 */
function comparePlays(a: TrickPlay, b: TrickPlay, vira: Card): number {
  if (a.faceDown || b.faceDown) return Number(b.faceDown) - Number(a.faceDown);
  return compareCards(a.card, b.card, vira);
}

/** Tricks per hand: a hand is best of 3. */
export const TRICKS_PER_HAND = 3;

export type { TrickWinner };

export interface TrickResult {
  winner: TrickWinner;
  /**
   * Who leads the next trick: the player of the winning card. On a tie, the
   * first player (in playing order) to lay one of the tied top cards.
   */
  leader: Seat;
}

/**
 * Resolves a complete trick. The highest card takes it; face-down cards are
 * the lowest of all, so a trick of only face-down cards is tied. Only the top cards
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
    const diff = comparePlays(play, best, vira);
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
 * - Trick 1 won, trick 2 tied → the trick-1 winner (or, with
 *   `firstWonThenTied: 'play_third'`, trick 3 decides and a tie there goes
 *   to the trick-1 winner).
 * - 1-1 and trick 3 tied → the trick-1 winner (or the *mão*'s team, with
 *   `splitThenTied: 'mao'`).
 *
 * With the standard rules a hand can end after 2 tricks (2-0, or a tie plus
 * a win in either order). `ties` defaults to `RULES.ties` (see config.ts).
 */
export function handWinner(
  tricks: readonly TrickWinner[],
  maoTeam: Team,
  ties: TieRules = RULES.ties,
): Team | null {
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

  // Trick 1 was won: winning trick 2 too settles the hand.
  if (t2 === t1) return t1;
  if (t2 === null) {
    if (ties.firstWonThenTied === 'first_trick_winner') return t1;
    if (t3 === undefined) return null;
    return t3 ?? t1;
  }
  // 1-1: trick 3 decides.
  if (t3 === undefined) return null;
  if (t3 !== null) return t3;
  return ties.splitThenTied === 'mao' ? maoTeam : t1;
}
