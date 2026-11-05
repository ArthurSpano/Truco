import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rateLimit.js';

describe('RateLimiter', () => {
  it('allows a burst then rejects', () => {
    const rl = new RateLimiter({ burst: 3, perSecond: 1 });
    expect([rl.allow(0), rl.allow(0), rl.allow(0), rl.allow(0)]).toEqual([true, true, true, false]);
  });

  it('refills over time', () => {
    const rl = new RateLimiter({ burst: 3, perSecond: 1 });
    for (let i = 0; i < 4; i++) rl.allow(0);
    expect(rl.allow(1000)).toBe(true);
    expect(rl.allow(1000)).toBe(false);
  });

  it('never exceeds burst after long idle', () => {
    const rl = new RateLimiter({ burst: 3, perSecond: 1 });
    rl.allow(0);
    const r = [rl.allow(100_000), rl.allow(100_000), rl.allow(100_000), rl.allow(100_000)];
    expect(r).toEqual([true, true, true, false]);
  });

  it('tolerates time going backwards', () => {
    const rl = new RateLimiter({ burst: 1, perSecond: 1 });
    expect(rl.allow(5000)).toBe(true);
    expect(() => rl.allow(1000)).not.toThrow();
    expect(rl.allow(1000)).toBe(false);
  });
});
