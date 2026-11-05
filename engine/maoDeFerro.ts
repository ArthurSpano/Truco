import { RULES } from './config.js';

/**
 * *Mão de ferro*: the hand played when both teams have 11 points.
 *
 * Nobody may look at their cards: every player plays blind, picking a card
 * from their hand without knowing what it is. Each card is turned up as it
 * is played and competes by its real value, so the hand is pure luck. No
 * truco may be called, there is no decision to make (unlike a mão de onze),
 * and deliberate face-down play (*encoberta*) is not allowed since every card
 * is already played blind. The hand is worth `RULES.maoDeFerroValue` (1
 * point), which wins the match.
 *
 * Start one with `startHand(..., { maoDeFerro: true })`; `handsVisibleTo`
 * then hides every hand, including each player's own, and cards are played
 * by position with `playBlind` (`playCard` rejects them, since a card id
 * names the card).
 */

/** Whether the match score (indexed by team) calls for a mão de ferro. */
export function isMaoDeFerro(scores: readonly [number, number]): boolean {
  return scores[0] === RULES.maoDeOnzeScore && scores[1] === RULES.maoDeOnzeScore;
}
