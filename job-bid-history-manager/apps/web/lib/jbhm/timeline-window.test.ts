import { describe, expect, it } from "vitest";

import {
  FUTURE_PAD_MS,
  initialRange,
  maxFutureEndMs,
} from "@/lib/jbhm/timeline-window";

describe("timeline future cap", () => {
  const now = Date.parse("2026-05-15T12:00:00.000Z");

  it("caps day view at 2 days past now", () => {
    expect(maxFutureEndMs("1d", now) - now).toBe(FUTURE_PAD_MS["1d"]);
    expect(FUTURE_PAD_MS["1d"]).toBe(2 * 86400000);
  });

  it("caps hour view at 5 hours past now", () => {
    expect(maxFutureEndMs("1h", now) - now).toBe(5 * 60 * 60 * 1000);
  });

  it("caps 30m view at 3 hours past now", () => {
    expect(maxFutureEndMs("30m", now) - now).toBe(3 * 60 * 60 * 1000);
  });

  it("caps 5m view at 30 minutes past now", () => {
    expect(maxFutureEndMs("5m", now) - now).toBe(30 * 60 * 1000);
  });

  it("initialRange end does not exceed maxFutureEndMs", () => {
    const r = initialRange("1h", { minMs: null, maxMs: null });
    const endMs = new Date(r.end).getTime();
    expect(endMs).toBeLessThanOrEqual(maxFutureEndMs("1h", Date.now()) + 5000);
  });
});
