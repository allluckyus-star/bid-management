import { describe, expect, it } from "vitest";

import {
  endOfZonedDayFromYmd,
  getZonedParts,
  startOfZonedDayFromYmd,
  zonedDayBucketKey,
} from "@/lib/datetime/zoned";

describe("team timezone helpers", () => {
  it("maps UTC instant to America/New_York calendar day", () => {
    const iso = "2026-05-23T02:30:00.000Z";
    const key = zonedDayBucketKey(new Date(iso).getTime(), "America/New_York");
    expect(key).toBe("2026-05-22T00:00:00");
  });

  it("start/end of YMD in team zone", () => {
    const start = startOfZonedDayFromYmd("2026-05-22", "America/New_York");
    const end = endOfZonedDayFromYmd("2026-05-22", "America/New_York");
    expect(new Date(start).toISOString()).toBe("2026-05-22T04:00:00.000Z");
    expect(new Date(end).toISOString()).toBe("2026-05-23T03:59:59.999Z");
  });

  it("getZonedParts matches wall clock", () => {
    const p = getZonedParts(new Date("2026-05-22T14:41:00.000Z").getTime(), "UTC");
    expect(p.year).toBe(2026);
    expect(p.month).toBe(5);
    expect(p.day).toBe(22);
    expect(p.hour).toBe(14);
  });
});
