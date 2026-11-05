import { describe, expect, it } from 'vitest';
import type { Card, CardId, Rank, Seat, Suit, Team } from '../shared/types.js';
import { makeCard } from './deck.js';
import { handWinner, resolveTrick, type TrickPlay, type TrickWinner } from './tricks.js';

const SUIT_BY_CODE: Record<string, Suit> = { c: 'clubs', h: 'hearts', s: 'spades', d: 'diamonds' };

/** `c('Ac')` → ace of clubs. */
function c(id: CardId): Card {
  return makeCard(id[0] as Rank, SUIT_BY_CODE[id[1] ?? ''] as Suit);
}

/** Plays in order from the given seats: `plays([0, '3c'], [1, '2h'])`. */
function plays(...entries: [Seat, CardId][]): TrickPlay[] {
  return entries.map(([seat, id]) => ({ seat, card: c(id) }));
}

// Vira 7 → manilha Q. Keeps manilhas out of the way unless a test wants them.
const VIRA = c('7d');

describe('resolveTrick', () => {
  it('the highest card takes the trick and its player leads next', () => {
    expect(resolveTrick(plays([0, 'Kc'], [1, '3h']), VIRA)).toEqual({ winner: 1, leader: 1 });
    expect(resolveTrick(plays([1, '4s'], [0, 'Ah']), VIRA)).toEqual({ winner: 0, leader: 0 });
  });

  it('compares non-manilhas by rank only, ignoring suit', () => {
    expect(resolveTrick(plays([0, '2d'], [1, 'Ac']), VIRA).winner).toBe(0);
  });

  it('a manilha beats a 3', () => {
    expect(resolveTrick(plays([0, '3c'], [1, 'Qd']), VIRA)).toEqual({ winner: 1, leader: 1 });
  });

  it('manilhas are ordered by suit: zap beats copas', () => {
    const trick = plays([0, 'Qh'], [1, '3s'], [2, 'Qs'], [3, 'Qc']);
    expect(resolveTrick(trick, VIRA)).toEqual({ winner: 1, leader: 3 });
  });

  it('equal top ranks from opposing teams tie the trick (empate)', () => {
    expect(resolveTrick(plays([0, '3c'], [1, '3h']), VIRA).winner).toBeNull();
  });

  it('on a tie, the first player to lay a tied top card leads next', () => {
    expect(resolveTrick(plays([1, '3c'], [0, '3h']), VIRA)).toEqual({ winner: null, leader: 1 });
    const fourPlayer = plays([2, 'Ks'], [3, '2c'], [0, '2d'], [1, '5h']);
    expect(resolveTrick(fourPlayer, VIRA)).toEqual({ winner: null, leader: 3 });
  });

  it('partners sharing the top card take the trick for their team', () => {
    // Seats 0 and 2 are partners in a 4-player game.
    const trick = plays([0, '3c'], [1, '2h'], [2, '3d'], [3, 'Ks']);
    expect(resolveTrick(trick, VIRA)).toEqual({ winner: 0, leader: 0 });
  });

  it('in 6 players, a three-way tie across teams is still a tie', () => {
    const trick = plays([3, 'Ac'], [4, 'Ah'], [5, '4c'], [0, 'As'], [1, '6c'], [2, '5d']);
    expect(resolveTrick(trick, VIRA)).toEqual({ winner: null, leader: 3 });
  });

  it('in 6 players, teammates sharing the top card take the trick', () => {
    // Seats 1, 3 and 5 are team 1.
    const trick = plays([0, 'Ks'], [1, '2c'], [2, 'Jh'], [3, '2s'], [4, 'Ad'], [5, '4h']);
    expect(resolveTrick(trick, VIRA)).toEqual({ winner: 1, leader: 1 });
  });

  it('a tie lower down does not matter when a higher card is played', () => {
    const trick = plays([0, 'Kc'], [1, 'Kh'], [2, '7c'], [3, '3s']);
    expect(resolveTrick(trick, VIRA)).toEqual({ winner: 1, leader: 3 });
  });

  it('a higher card after a tie breaks it', () => {
    const trick = plays([0, 'Ac'], [1, 'Ah'], [2, '2s'], [3, '5h']);
    expect(resolveTrick(trick, VIRA)).toEqual({ winner: 0, leader: 2 });
  });

  it('uses the manilha after the vira, wrapping around (vira 3 → manilha 4)', () => {
    expect(resolveTrick(plays([0, '3c'], [1, '4d']), c('3h'))).toEqual({ winner: 1, leader: 1 });
  });

  it('throws on an empty trick', () => {
    expect(() => resolveTrick([], VIRA)).toThrow();
  });
});

describe('handWinner', () => {
  const T = (...tricks: TrickWinner[]): TrickWinner[] => tricks;

  describe.each([0, 1] as const)('mão is team %i', (mao: Team) => {
    it.each([
      // Not decided yet.
      [T(), null],
      [T(0), null],
      [T(1), null],
      [T(null), null],
      [T(0, 1), null],
      [T(1, 0), null],
      [T(null, null), null],
      // Two wins.
      [T(0, 0), 0],
      [T(1, 1), 1],
      [T(0, 1, 0), 0],
      [T(0, 1, 1), 1],
      [T(1, 0, 1), 1],
      [T(1, 0, 0), 0],
      // Trick 1 tied → trick 2 winner wins.
      [T(null, 0), 0],
      [T(null, 1), 1],
      // Trick 1 and 2 tied → trick 3 decides.
      [T(null, null, 0), 0],
      [T(null, null, 1), 1],
      // Trick 1 won, trick 2 tied → trick-1 winner.
      [T(0, null), 0],
      [T(1, null), 1],
      // 1-1, trick 3 tied → trick-1 winner.
      [T(0, 1, null), 0],
      [T(1, 0, null), 1],
    ] as const)('%j → %p', (tricks, expected) => {
      expect(handWinner(tricks, mao)).toBe(expected);
    });

    it('all three tricks tied → the mão’s team', () => {
      expect(handWinner(T(null, null, null), mao)).toBe(mao);
    });
  });

  it('rejects more than three tricks', () => {
    expect(() => handWinner(T(0, 1, null, 0), 0)).toThrow();
  });
});
