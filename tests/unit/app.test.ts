import { describe, it, expect } from "bun:test";
import { getTitleDBRefreshDelayMs } from "../../src/app";

describe("app/getTitleDBRefreshDelayMs", () => {
  it("should convert a positive TTL in seconds to milliseconds", () => {
    expect(getTitleDBRefreshDelayMs(86400)).toBe(86_400_000);
    expect(getTitleDBRefreshDelayMs(1)).toBe(1000);
  });

  it("should return null for zero or negative TTLs", () => {
    expect(getTitleDBRefreshDelayMs(0)).toBeNull();
    expect(getTitleDBRefreshDelayMs(-60)).toBeNull();
  });

  it("should return null for non-numeric TTLs", () => {
    expect(getTitleDBRefreshDelayMs(Number.NaN)).toBeNull();
    expect(getTitleDBRefreshDelayMs(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("should clamp TTLs that would overflow setTimeout", () => {
    // 30 days exceeds the 2^31-1 ms setTimeout limit (~24.8 days)
    expect(getTitleDBRefreshDelayMs(30 * 86400)).toBe(2 ** 31 - 1);
  });
});
