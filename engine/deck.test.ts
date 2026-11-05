import { describe, expect, it } from 'vitest';
import type { Rank } from '../shared/types.js';
import {
  DECK_SIZE,
  RANKS,
  SUITS,
  cardId,
  createDeck,
  isManilha,
  makeCard,
  manilhaRank,
  rankStrength,
} from './deck.js';

describe('createDeck', () => {
  it('has 40 cards: 10 ranks × 4 suits', () => {
    const deck = createDeck();
    expect(DECK_SIZE).toBe(40);
    expect(deck).toHaveLength(40);
    for (const rank of RANKS) {
      for (const suit of SUITS) {
        expect(deck.filter((c) => c.rank === rank && c.suit === suit)).toHaveLength(1);
      }
    }
  });

  it('contains no 8, 9, 10 or jokers', () => {
    const ranks = new Set<string>(createDeck().map((c) => c.rank));
    for (const removed of ['8', '9', '10', 'joker']) {
      expect(ranks.has(removed)).toBe(false);
    }
  });

  it('gives every card a unique id that matches its rank and suit', () => {
    const deck = createDeck();
    expect(new Set(deck.map((c) => c.id)).size).toBe(40);
    for (const card of deck) {
      expect(card.id).toBe(cardId(card.rank, card.suit));
    }
    expect(cardId('A', 'clubs')).toBe('Ac');
    expect(cardId('7', 'diamonds')).toBe('7d');
    expect(cardId('Q', 'hearts')).toBe('Qh');
    expect(cardId('3', 'spades')).toBe('3s');
  });

  it('returns a new array each time (callers may mutate it)', () => {
    const a = createDeck();
    a.pop();
    expect(createDeck()).toHaveLength(40);
  });
});

describe('rank order', () => {
  it('goes 4 5 6 7 Q J K A 2 3 from weakest to strongest', () => {
    const scrambled: Rank[] = ['K', '3', '4', 'J', '7', 'A', '5', '2', 'Q', '6'];
    const sorted = scrambled.sort((a, b) => rankStrength(a) - rankStrength(b));
    expect(sorted).toEqual(['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3']);
  });

  it('ranks 3 highest and 4 lowest', () => {
    expect(rankStrength('3')).toBe(9);
    expect(rankStrength('4')).toBe(0);
    expect(rankStrength('2')).toBeGreaterThan(rankStrength('A'));
    expect(rankStrength('Q')).toBeLessThan(rankStrength('J'));
    expect(rankStrength('J')).toBeLessThan(rankStrength('K'));
  });

  it('rejects ranks that are not in the Truco deck', () => {
    const notARank: string = '8';
    expect(() => rankStrength(notARank as Rank)).toThrow(/Unknown rank/);
  });
});

describe('manilhaRank', () => {
  const cases: [vira: Rank, manilha: Rank][] = [
    ['4', '5'],
    ['5', '6'],
    ['6', '7'],
    ['7', 'Q'],
    ['Q', 'J'],
    ['J', 'K'],
    ['K', 'A'],
    ['A', '2'],
    ['2', '3'],
    ['3', '4'],
  ];

  it.each(cases)('vira %s → manilha %s', (vira, manilha) => {
    expect(manilhaRank(makeCard(vira, 'hearts'))).toBe(manilha);
  });

  it('wraps around: vira 3 makes the 4 the manilha', () => {
    expect(manilhaRank(makeCard('3', 'clubs'))).toBe('4');
  });

  it('does not depend on the vira suit', () => {
    for (const suit of SUITS) {
      expect(manilhaRank(makeCard('7', suit))).toBe('Q');
    }
  });
});

describe('isManilha', () => {
  it('marks all four cards of the manilha rank, and nothing else', () => {
    const vira = makeCard('K', 'spades');
    const manilhas = createDeck().filter((c) => isManilha(c, vira));
    expect(manilhas.map((c) => c.id).sort()).toEqual(['Ac', 'Ad', 'Ah', 'As']);
  });

  it('never marks the vira rank itself', () => {
    const vira = makeCard('3', 'diamonds');
    expect(isManilha(makeCard('3', 'clubs'), vira)).toBe(false);
    expect(isManilha(makeCard('4', 'clubs'), vira)).toBe(true);
  });
});
