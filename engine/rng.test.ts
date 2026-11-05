import { describe, expect, it } from 'vitest';
import { createDeck } from './deck.js';
import { nextFloat, nextInt, seedRng, shuffle, type RngState } from './rng.js';

/** Draws `n` floats starting from `rng`, threading the state through. */
function floats(rng: RngState, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const [value, next] = nextFloat(rng);
    out.push(value);
    rng = next;
  }
  return out;
}

describe('seedRng', () => {
  it('turns any number into a uint32 state', () => {
    for (const seed of [0, 1, -1, 42, 2 ** 32, 2 ** 40 + 7, 3.9, -123456789]) {
      const state = seedRng(seed);
      expect(Number.isInteger(state)).toBe(true);
      expect(state).toBeGreaterThanOrEqual(0);
      expect(state).toBeLessThan(2 ** 32);
    }
  });

  it('wraps seeds modulo 2^32 and truncates fractions', () => {
    expect(seedRng(2 ** 32 + 5)).toBe(seedRng(5));
    expect(seedRng(-1)).toBe(2 ** 32 - 1);
    expect(seedRng(7.9)).toBe(seedRng(7));
  });

  it('rejects non-finite seeds', () => {
    expect(() => seedRng(Number.NaN)).toThrow(/seed/);
    expect(() => seedRng(Number.POSITIVE_INFINITY)).toThrow(/seed/);
  });
});

describe('nextFloat', () => {
  it('is deterministic: the same seed gives the same sequence', () => {
    expect(floats(seedRng(1234), 20)).toEqual(floats(seedRng(1234), 20));
  });

  it('different seeds give different sequences', () => {
    expect(floats(seedRng(1), 5)).not.toEqual(floats(seedRng(2), 5));
  });

  it('is pure: calling it twice on the same state gives the same result', () => {
    const rng = seedRng(99);
    expect(nextFloat(rng)).toEqual(nextFloat(rng));
  });

  it('advances the state', () => {
    const rng = seedRng(99);
    const [, next] = nextFloat(rng);
    expect(next).not.toBe(rng);
  });

  it('returns values in [0, 1)', () => {
    for (const value of floats(seedRng(7), 10_000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('is roughly uniform', () => {
    const buckets = new Array<number>(10).fill(0);
    const n = 50_000;
    for (const value of floats(seedRng(2024), n)) {
      buckets[Math.floor(value * 10)] = (buckets[Math.floor(value * 10)] ?? 0) + 1;
    }
    for (const count of buckets) {
      expect(count / n).toBeGreaterThan(0.09);
      expect(count / n).toBeLessThan(0.11);
    }
  });

  it('pins the sequence so saved seeds stay reproducible across versions', () => {
    expect(floats(seedRng(42), 3)).toMatchInlineSnapshot(`
      [
        0.6011037519201636,
        0.44829055899754167,
        0.8524657934904099,
      ]
    `);
  });
});

describe('nextInt', () => {
  it('returns integers in [0, max)', () => {
    let rng = seedRng(5);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const [value, next] = nextInt(rng, 6);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(6);
      seen.add(value);
      rng = next;
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('always returns 0 when max is 1', () => {
    expect(nextInt(seedRng(123), 1)[0]).toBe(0);
  });

  it('rejects a max that is not a positive integer', () => {
    for (const max of [0, -3, 2.5, Number.NaN]) {
      expect(() => nextInt(seedRng(1), max)).toThrow(/max/);
    }
  });
});

describe('shuffle', () => {
  const ids = () => createDeck().map((c) => c.id);

  it('is a permutation: same elements, same length', () => {
    const [shuffled] = shuffle(ids(), seedRng(8));
    expect(shuffled).toHaveLength(40);
    expect([...shuffled].sort()).toEqual([...ids()].sort());
  });

  it('is deterministic for a given seed', () => {
    expect(shuffle(ids(), seedRng(31337))).toEqual(shuffle(ids(), seedRng(31337)));
  });

  it('gives different orders for different seeds', () => {
    expect(shuffle(ids(), seedRng(1))[0]).not.toEqual(shuffle(ids(), seedRng(2))[0]);
  });

  it('actually shuffles a 40-card deck', () => {
    const [shuffled] = shuffle(ids(), seedRng(3));
    expect(shuffled).not.toEqual(ids());
  });

  it('does not mutate its input', () => {
    const input = ids();
    const copy = [...input];
    shuffle(input, seedRng(4));
    expect(input).toEqual(copy);
  });

  it('returns the advanced state so consecutive shuffles differ', () => {
    const [first, rng] = shuffle(ids(), seedRng(10));
    const [second] = shuffle(ids(), rng);
    expect(second).not.toEqual(first);
  });

  it('handles empty and single-element arrays', () => {
    const rng = seedRng(1);
    expect(shuffle([], rng)).toEqual([[], rng]);
    expect(shuffle(['x'], rng)).toEqual([['x'], rng]);
  });

  it('puts every element in every position about equally often', () => {
    // 4 items → 24 permutations; check positional uniformity over many runs.
    const items = ['a', 'b', 'c', 'd'] as const;
    const counts = items.map(() => new Array<number>(items.length).fill(0));
    let rng = seedRng(77);
    const runs = 20_000;
    for (let r = 0; r < runs; r++) {
      const [shuffled, next] = shuffle(items, rng);
      rng = next;
      shuffled.forEach((item, pos) => {
        const row = counts[items.indexOf(item)];
        if (row) row[pos] = (row[pos] ?? 0) + 1;
      });
    }
    for (const row of counts) {
      for (const count of row) {
        expect(count / runs).toBeGreaterThan(0.23);
        expect(count / runs).toBeLessThan(0.27);
      }
    }
  });
});
