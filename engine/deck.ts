import type { Card, CardId, Rank, Suit, SuitCode } from '../shared/types.js';

/** Ranks from weakest to strongest (ignoring manilhas). */
export const RANKS: readonly Rank[] = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];

/** All suits. This is only the deck-building order, not card strength. */
export const SUITS: readonly Suit[] = ['clubs', 'hearts', 'spades', 'diamonds'];

const SUIT_CODES: Readonly<Record<Suit, SuitCode>> = {
  clubs: 'c',
  hearts: 'h',
  spades: 's',
  diamonds: 'd',
};

/** Number of cards in a Truco deck: 10 ranks × 4 suits. */
export const DECK_SIZE = RANKS.length * SUITS.length;

export function cardId(rank: Rank, suit: Suit): CardId {
  return `${rank}${SUIT_CODES[suit]}`;
}

export function makeCard(rank: Rank, suit: Suit): Card {
  return { id: cardId(rank, suit), rank, suit };
}

/** A fresh, unshuffled 40-card deck, grouped by rank (weakest first), then by suit. */
export function createDeck(): Card[] {
  return RANKS.flatMap((rank) => SUITS.map((suit) => makeCard(rank, suit)));
}

/** Strength of a rank in normal (non-manilha) play: 0 for `4` up to 9 for `3`. */
export function rankStrength(rank: Rank): number {
  const strength = RANKS.indexOf(rank);
  if (strength === -1) throw new Error(`Unknown rank: ${rank}`);
  return strength;
}

/**
 * The manilha rank is the one right after the vira, wrapping around:
 * vira `7` → manilha `Q`, vira `3` → manilha `4`.
 */
export function manilhaRank(vira: Card): Rank {
  const next = RANKS[(rankStrength(vira.rank) + 1) % RANKS.length];
  // Unreachable: the index is always in range. Narrows away `undefined`.
  if (next === undefined) throw new Error(`Unknown rank: ${vira.rank}`);
  return next;
}

export function isManilha(card: Card, vira: Card): boolean {
  return card.rank === manilhaRank(vira);
}
