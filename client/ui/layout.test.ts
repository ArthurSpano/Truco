import { describe, expect, it } from 'vitest';
import type { GameMode } from '../../shared/types.js';
import {
  STAGE,
  TABLE_CENTRE,
  anchorFor,
  isPartner,
  relativeIndex,
  seatGeometry,
} from './layout.js';

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

describe('seatGeometry', () => {
  const anchorsOf = (mode: GameMode) => range(mode).map((i) => anchorFor(mode, i));
  const FELT_RADIUS = 137;

  it('uses the mockup positions for 4 players', () => {
    expect(seatGeometry(4, 'top').avatar).toEqual({ x: 195, y: 112 });
    expect(seatGeometry(4, 'left').played).toEqual({ x: -50, y: -2, rot: 86 });
    expect(seatGeometry(4, 'bottom').from).toEqual({ x: 0, y: 270, rot: -8, scale: 1.55 });
  });

  it('2 players share the 4-player bottom and top', () => {
    expect(seatGeometry(2, 'top')).toEqual(seatGeometry(4, 'top'));
    expect(seatGeometry(2, 'bottom')).toEqual(seatGeometry(4, 'bottom'));
  });

  it('only the viewer has no avatar', () => {
    for (const mode of MODES) {
      for (const a of anchorsOf(mode)) {
        expect(seatGeometry(mode, a).avatar === null).toBe(a === 'bottom');
      }
    }
  });

  it('keeps avatars and bubbles on the stage', () => {
    for (const mode of MODES) {
      for (const a of anchorsOf(mode)) {
        const g = seatGeometry(mode, a);
        for (const p of [g.avatar, g.bubble]) {
          if (!p) continue;
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThanOrEqual(STAGE.width);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeLessThanOrEqual(STAGE.height);
        }
      }
    }
  });

  it('puts each seat on its side of the table', () => {
    for (const mode of MODES) {
      for (const a of anchorsOf(mode)) {
        const { chair, played } = seatGeometry(mode, a);
        if (a.includes('left')) expect(chair.x).toBeLessThan(TABLE_CENTRE.x);
        if (a.includes('right')) expect(chair.x).toBeGreaterThan(TABLE_CENTRE.x);
        if (a.startsWith('top')) expect(chair.y).toBeLessThan(TABLE_CENTRE.y);
        if (a.startsWith('bottom')) expect(chair.y).toBeGreaterThan(TABLE_CENTRE.y);
        // The played card leans towards its owner.
        expect(Math.sign(played.x)).toBe(Math.sign(chair.x - TABLE_CENTRE.x) || 0);
      }
    }
  });

  it('keeps played cards well inside the felt and distinct per seat', () => {
    for (const mode of MODES) {
      const spots = anchorsOf(mode).map((a) => seatGeometry(mode, a).played);
      for (const p of spots) expect(Math.hypot(p.x, p.y)).toBeLessThan(FELT_RADIUS - 40);
      expect(new Set(spots.map((p) => `${p.x},${p.y}`)).size).toBe(mode);
    }
  });

  it('flies cards in from outside their resting spot', () => {
    for (const mode of MODES) {
      for (const a of anchorsOf(mode)) {
        const { played, from } = seatGeometry(mode, a);
        expect(Math.hypot(from.x, from.y)).toBeGreaterThan(Math.hypot(played.x, played.y));
      }
    }
  });

  it('places the 6-player hexagon symmetrically', () => {
    const tr = seatGeometry(6, 'top-right').chair;
    const tl = seatGeometry(6, 'top-left').chair;
    expect(tr.x - TABLE_CENTRE.x).toBeCloseTo(TABLE_CENTRE.x - tl.x);
    expect(tr.y).toBe(tl.y);
  });
});

describe('isPartner', () => {
  it('is true for same parity, not self', () => {
    expect(isPartner(0, 2)).toBe(true);
    expect(isPartner(0, 1)).toBe(false);
    expect(isPartner(0, 0)).toBe(false);
  });
});
