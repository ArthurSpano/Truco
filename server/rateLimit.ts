export const DEFAULT_BURST = 20;
export const DEFAULT_PER_SECOND = 10;

export interface RateLimiterOptions {
  burst: number;
  perSecond: number;
}

/** Token bucket: starts full, refills continuously, capped at `burst`. */
export class RateLimiter {
  private tokens: number;
  private last: number | null = null;

  constructor(private readonly opts: RateLimiterOptions) {
    this.tokens = opts.burst;
  }

  allow(now: number): boolean {
    if (this.last !== null && now > this.last) {
      const refill = ((now - this.last) / 1000) * this.opts.perSecond;
      this.tokens = Math.min(this.opts.burst, this.tokens + refill);
    }
    if (this.last === null || now > this.last) this.last = now;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
}
