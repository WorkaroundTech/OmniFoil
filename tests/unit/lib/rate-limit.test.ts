import { describe, it, expect } from "bun:test";
import { createRateLimiter } from "../../../src/lib/rate-limit";

describe("lib/rate-limit", () => {
  it("blocks after the limit and recovers after the window", () => {
    let now = 1000;
    const limiter = createRateLimiter(2, 60_000, () => now);
    expect(limiter.hit("a")).toBe(0);
    expect(limiter.hit("a")).toBe(0);
    expect(limiter.hit("a")).toBe(60);
    expect(limiter.hit("b")).toBe(0); // separate key
    now += 60_000;
    expect(limiter.hit("a")).toBe(0);
  });
});
