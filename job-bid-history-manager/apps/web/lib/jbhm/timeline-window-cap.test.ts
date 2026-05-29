import { describe, expect, it } from "vitest";

import { capTimelineLoadRange } from "@/lib/jbhm/timeline-window";

describe("capTimelineLoadRange", () => {
  it("trims multi-year day ranges to a bounded window", () => {
    const wide = {
      start: "2020-01-01T00:00:00.000Z",
      end: "2026-05-01T00:00:00.000Z",
    };
    const capped = capTimelineLoadRange(wide, "1d", "UTC");
    const days =
      (new Date(capped.end).getTime() - new Date(capped.start).getTime()) /
      86400000;
    expect(days).toBeLessThanOrEqual(130);
    expect(new Date(capped.end).getTime()).toBe(new Date(wide.end).getTime());
  });
});
