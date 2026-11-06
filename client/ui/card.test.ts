import { describe, expect, it } from 'vitest';
import type { Card, Suit } from '../../shared/types.js';
import { cardAriaLabel, rankLabel, suitColor, suitGlyph } from './card.js';

describe('suitGlyph', () => {
  it('maps every suit to its symbol', () => {
    expect(suitGlyph('clubs')).toBe('♣');
    expect(suitGlyph('hearts')).toBe('♥');
    expect(suitGlyph('spades')).toBe('♠');
    expect(suitGlyph('diamonds')).toBe('♦');
  });
});

describe('suitColor', () => {
  it('is red for hearts and diamonds, black for clubs and spades', () => {
    const expected: Record<Suit, 'red' | 'black'> = {
      clubs: 'black',
      hearts: 'red',
      spades: 'black',
      diamonds: 'red',
    };
    for (const [suit, colour] of Object.entries(expected)) {
      expect(suitColor(suit as Suit)).toBe(colour);
    }
  });
});

describe('rankLabel', () => {
  it('is the identity', () => {
    expect(rankLabel('Q')).toBe('Q');
    expect(rankLabel('3')).toBe('3');
  });
});

describe('cardAriaLabel', () => {
  const card = (id: Card['id'], rank: Card['rank'], suit: Suit): Card => ({ id, rank, suit });

  it('names the suit in pt-BR', () => {
    expect(cardAriaLabel(card('3h', '3', 'hearts'))).toBe('3 de copas');
    expect(cardAriaLabel(card('Ac', 'A', 'clubs'))).toBe('A de paus');
    expect(cardAriaLabel(card('Ks', 'K', 'spades'))).toBe('K de espadas');
    expect(cardAriaLabel(card('7d', '7', 'diamonds'))).toBe('7 de ouros');
  });
});
