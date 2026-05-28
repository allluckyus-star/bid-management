import type { TimelineBucketKey } from "@jbhm/shared";

import {
  endOfZonedDayMs,
  endOfZonedMonthMs,
  formatDateInTimeZone,
  normalizeTimeZone,
  startOfZonedDayMs,
  zonedTimeToUtc,
} from "@/lib/datetime/zoned";

export function dayBoundsFromBucketKey(
  startIso: string,
  timeZone: string,
): { startMs: number; endMs: number } {
  const tz = normalizeTimeZone(timeZone);
  const m = startIso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const startMs = zonedTimeToUtc(
      {
        year: Number(m[1]),
        month: Number(m[2]),
        day: Number(m[3]),
        hour: 0,
        minute: 0,
        second: 0,
      },
      tz,
    );
    return { startMs, endMs: endOfZonedDayMs(startMs, tz) };
  }
  const ms = new Date(startIso).getTime();
  return { startMs: startOfZonedDayMs(ms, tz), endMs: endOfZonedDayMs(ms, tz) };
}

export function formatMonthBucketRange(bucketStartIso: string, timeZone: string): string {
  const tz = normalizeTimeZone(timeZone);
  const startMs = new Date(bucketStartIso).getTime();
  const endMs = endOfZonedMonthMs(startMs, tz);
  const fmt = (ms: number) =>
    new Date(ms).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: tz,
    });
  return `${fmt(startMs)} – ${fmt(endMs)}`;
}

export function formatMonthAxisLabel(bucketStartIso: string, timeZone: string): string {
  const tz = normalizeTimeZone(timeZone);
  return new Date(bucketStartIso).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: tz,
  });
}

export function formatDayBucketRange(bucketStartIso: string, timeZone: string): string {
  const tz = normalizeTimeZone(timeZone);
  const { startMs, endMs } = dayBoundsFromBucketKey(bucketStartIso, tz);
  const fmt = (ms: number) =>
    new Date(ms).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: tz,
    });
  return `${fmt(startMs)} – ${fmt(endMs)}`;
}

export function formatBucketRange(
  startIso: string,
  endIso: string,
  bucket: TimelineBucketKey,
  timeZone: string,
): string {
  const tz = normalizeTimeZone(timeZone);
  if (bucket === "1month") return formatMonthBucketRange(startIso, tz);
  if (bucket === "1d") return formatDayBucketRange(startIso, tz);
  return `${formatDateInTimeZone(startIso, tz)} – ${formatDateInTimeZone(endIso, tz)}`;
}

export function bucketAxisLabel(
  iso: string,
  bucket: TimelineBucketKey,
  timeZone: string,
): string {
  const tz = normalizeTimeZone(timeZone);
  if (bucket === "1month") return formatMonthAxisLabel(iso, tz);
  if (bucket === "1d") {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const ms = zonedTimeToUtc(
        {
          year: Number(m[1]),
          month: Number(m[2]),
          day: Number(m[3]),
          hour: 12,
          minute: 0,
          second: 0,
        },
        tz,
      );
      return new Date(ms).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: tz,
      });
    }
  }
  const datePart = new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: tz,
  });
  const timePart = new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  });
  return `${datePart}\n${timePart}`;
}
