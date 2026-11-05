import { describe, expect, it } from 'vitest';
import type { GameMode } from '../../shared/types.js';
import { anchorFor, chairPosition, isPartner, relativeIndex } from './layout.js';

const MODES: GameMode[] = [2, 4, 6];
const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

describe('relativeIndex', () => {
  for (const mode of MODES) {
    it(`is a permutation of 0..${mode - 1} for every mySeat (${mode}p)`, () => {
      for (const me of range(mode)) {
        const rel = range(mode).map((s) => relativeIndex(me, s, mode));
        expect([...rel].sort((a, b) => a - b)).toEqual(range(mode));
        expect(relativeIndex(me, me, mode)).toBe(0);
      }
    });
  }

  it('wraps around: mySeat 3 in 4p sees seat 0 at index 1', () => {
    expect(relativeIndex(3, 0, 4)).toBe(1);
  });
});

describe('anchorFor', () => {
  it('places the partner opposite in 4p and the opponent on top in 2p', () => {
    expect(anchorFor(4, 2)).toBe('top');
    expect(anchorFor(2, 1)).toBe('top');
  });

  it('matches the documented anchor order', () => {
    expect(range(4).map((i) => anchorFor(4, i))).toEqual(['bottom', 'right', 'top', 'left']);
    expect(range(6).map((i) => anchorFor(6, i))).toEqual([
      'bottom',
      'bottom-right',
      'top-right',
      'top',
      'top-left',
      'bottom-left',
    ]);
  });

  it('gives distinct anchors in every mode', () => {
    for (const mode of MODES) {
      expect(new Set(range(mode).map((i) => anchorFor(mode, i))).size).toBe(mode);
    }
  });

  it('partners sit at even relative indices', () => {
    for (const mode of [4, 6] as const) {
      for (const me of range(mode)) {
        const partners = range(mode)
          .filter((s) => isPartner(me, s))
          .map((s) => relativeIndex(me, s, mode))
          .sort((a, b) => a - b);
        expect(partners).toEqual(mode === 4 ? [2] : [2, 4]);
      }
    }
  });
});

describe('chairPosition', () => {
  it('puts bottom below and top above the centre', () => {
    expect(chairPosition('bottom').y).toBeGreaterThan(50);
    expect(chairPosition('top').y).toBeLessThan(50);
  });

  it('puts left/right on the correct sides', () => {
    expect(chairPosition('left').x).toBeLessThan(50);
    expect(chairPosition('right').x).toBeGreaterThan(50);
  });

  it('keeps coordinates within 0..100', () => {
    const all = [
      'bottom',
      'right',
      'top',
      'left',
      'bottom-right',
      'top-right',
      'top-left',
      'bottom-left',
    ] as const;
    for (const a of all) {
      const p = chairPosition(a);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(100);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(100);
    }
  });

  it('opposite anchors are 180 degrees apart', () => {
    const pairs = [
      ['bottom', 'top'],
      ['left', 'right'],
      ['bottom-right', 'top-left'],
      ['top-right', 'bottom-left'],
    ] as const;
    for (const [a, b] of pairs) {
      const d = Math.abs(chairPosition(a).angle - chairPosition(b).angle) % 360;
      expect(d).toBe(180);
    }
  });
});

describe('isPartner', () => {
  it('is true for same parity, not self', () => {
    expect(isPartner(0, 2)).toBe(true);
    expect(isPartner(0, 1)).toBe(false);
    expect(isPartner(0, 0)).toBe(false);
  });
});
