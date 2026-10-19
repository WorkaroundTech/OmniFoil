/**
 * Minimal in-memory fixed-window rate limiter.
 */

export interface RateLimiter {
  /** Returns 0 when the call is allowed, otherwise the seconds until the window resets. */
  hit(key: string): number;
}

export function createRateLimiter(limit: number, windowMs = 60_000, now: () => number = Date.now): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();

  return {
    hit(key) {
      const t = now();

      // Drop expired windows so the map cannot grow without bound
      for (const [k, w] of windows) {
        if (t - w.start >= windowMs) windows.delete(k);
      }

      const current = windows.get(key);
      if (!current) {
        windows.set(key, { start: t, count: 1 });
        return 0;
      }
      if (current.count >= limit) {
        return Math.max(1, Math.ceil((current.start + windowMs - t) / 1000));
      }
      current.count++;
      return 0;
    },
  };
}
