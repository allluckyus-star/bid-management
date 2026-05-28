import type { TimelineBucketKey } from "@jbhm/shared";

import {
  addZonedDays,
  addZonedMonths,
  endOfZonedMonthMs,
  normalizeTimeZone,
  startOfZonedMonthMs,
  zonedDayBucketKey,
  zonedHourBucketKey,
} from "@/lib/datetime/zoned";

const MS_1H = 3600 * 1000;

export function floorBucket(
  iso: string,
  bucket: TimelineBucketKey,
  timeZone: string,
): string {
  const tz = normalizeTimeZone(timeZone);
  const ms = new Date(iso).getTime();
  if (bucket === "1month") {
    return new Date(startOfZonedMonthMs(ms, tz)).toISOString();
  }
  if (bucket === "1d") {
    return zonedDayBucketKey(ms, tz);
  }
  if (bucket === "1h") {
    return zonedHourBucketKey(ms, tz);
  }
  if (bucket === "30m") {
    const t = Math.floor(ms / (30 * 60 * 1000)) * (30 * 60 * 1000);
    return new Date(t).toISOString();
  }
  const t = Math.floor(ms / (5 * 60 * 1000)) * (5 * 60 * 1000);
  return new Date(t).toISOString();
}

export function addBucket(
  slot: string,
  bucket: TimelineBucketKey,
  timeZone: string,
): string {
  const tz = normalizeTimeZone(timeZone);
  if (bucket === "1month") {
    const start = new Date(slot).getTime();
    return new Date(addZonedMonths(start, 1, tz)).toISOString();
  }
  if (bucket === "1d") {
    const start = new Date(slot.includes("T") ? slot : `${slot}T12:00:00`).getTime();
    return zonedDayBucketKey(addZonedDays(start, 1, tz), tz);
  }
  if (bucket === "1h") {
    const d = new Date(slot);
    d.setTime(d.getTime() + MS_1H);
    return zonedHourBucketKey(d.getTime(), tz);
  }
  if (bucket === "30m") {
    return new Date(new Date(slot).getTime() + 30 * 60 * 1000).toISOString();
  }
  return new Date(new Date(slot).getTime() + 5 * 60 * 1000).toISOString();
}

export function jobTimestampInRange(
  capturedAt: string,
  startIso: string,
  endIso: string,
): boolean {
  const t = new Date(capturedAt).getTime();
  return t >= new Date(startIso).getTime() && t <= new Date(endIso).getTime();
}

/** End of month bucket (inclusive) for chart labels. */
export function monthBucketEndMs(bucketStartIso: string, timeZone: string): number {
  const tz = normalizeTimeZone(timeZone);
  return endOfZonedMonthMs(new Date(bucketStartIso).getTime(), tz);
}
