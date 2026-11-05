/**
 * Seeded, pure pseudo-random number generator (mulberry32).
 *
 * The state is a single uint32, so it can live inside the plain-data game
 * state: snapshots stay serializable, and replaying the same intents from the
 * same seed always deals the same cards. Every function takes a state and
 * returns the advanced state alongside the result; nothing is mutated.
 *
 * Not cryptographically secure. Fine for dealing cards between friends; the
 * server picks the initial seed.
 */

/** Opaque-ish RNG state: an unsigned 32-bit integer. */
export type RngState = number;

const UINT32 = 2 ** 32;

/** Normalizes any finite number into a valid RNG state (mod 2^32, fraction dropped). */
export function seedRng(seed: number): RngState {
  if (!Number.isFinite(seed)) throw new Error(`Invalid RNG seed: ${seed}`);
  return Math.trunc(seed) >>> 0;
}

/** Returns a float in [0, 1) and the next state. */
export function nextFloat(state: RngState): [value: number, next: RngState] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / UINT32;
  return [value, next];
}

/** Returns an integer in [0, max) and the next state. */
export function nextInt(state: RngState, max: number): [value: number, next: RngState] {
  if (!Number.isInteger(max) || max <= 0) {
    throw new Error(`nextInt max must be a positive integer, got ${max}`);
  }
  const [value, next] = nextFloat(state);
  return [Math.floor(value * max), next];
}

/** Fisher–Yates shuffle. Returns a new array and the next state; `items` is untouched. */
export function shuffle<T>(items: readonly T[], state: RngState): [shuffled: T[], next: RngState] {
  const out = [...items];
  let rng = state;
  for (let i = out.length - 1; i > 0; i--) {
    const [j, next] = nextInt(rng, i + 1);
    rng = next;
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return [out, rng];
}
