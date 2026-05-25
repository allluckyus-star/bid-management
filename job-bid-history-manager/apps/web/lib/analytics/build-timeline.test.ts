import { describe, expect, it } from "vitest";

import { buildTimelineFromRows } from "@/lib/analytics/build-timeline";

describe("buildTimelineFromRows", () => {
  const rows = [
    {
      captured_at: "2026-05-22T14:41:00.000Z",
      captured_by: "ethan",
      company_name: "Co A",
    },
    {
      captured_at: "2026-05-24T17:17:00.000Z",
      captured_by: "allluckyus",
      company_name: "Co B",
    },
  ];

  it("counts both users in hour buckets inside the loaded window", () => {
    const out = buildTimelineFromRows(rows, "1h", "2026-05-20T00:00:00.000Z", "2026-05-25T23:59:59.999Z");
    const ethan = out.series.find((s) => s.captured_by === "ethan");
    const ally = out.series.find((s) => s.captured_by === "allluckyus");
    expect(ethan).toBeDefined();
    expect(ally).toBeDefined();
    expect(ethan!.buckets.some((b) => b.count > 0)).toBe(true);
    expect(ally!.buckets.some((b) => b.count > 0)).toBe(true);
  });

  it("counts both users on day buckets", () => {
    const out = buildTimelineFromRows(rows, "1d", "2026-05-20T00:00:00.000Z", "2026-05-25T23:59:59.999Z");
    const ethanDay = out.series
      .find((s) => s.captured_by === "ethan")
      ?.buckets.find((b) => b.count > 0);
    const allyDay = out.series
      .find((s) => s.captured_by === "allluckyus")
      ?.buckets.find((b) => b.count > 0);
    expect(ethanDay?.count).toBe(1);
    expect(allyDay?.count).toBe(1);
  });
});
