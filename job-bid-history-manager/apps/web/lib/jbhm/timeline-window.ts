import type { TimelineBucketKey } from "@jbhm/shared";

import {
  addZonedMonths,
  DEFAULT_TEAM_TIMEZONE,
  endOfZonedMonthMs,
  normalizeTimeZone,
  startOfZonedDayMs,
  startOfZonedMonthMs,
} from "@/lib/datetime/zoned";

const DAY_MS = 86400000;

/** Visible range width + pan step per bucket (client-driven; not the old 14-day-only history cap). */
export const VIEW_WINDOW = {
  "5m": { initialHalfDays: 2, panStepDays: 1 },
  "30m": { initialHalfDays: 7, panStepDays: 2 },
  "1h": { initialHalfDays: 7, panStepDays: 3 },
  "1d": { initialHalfDays: 30, panStepDays: 10 },
  "1month": { initialHalfMonths: 1, panStepMonths: 1 },
} as const;

/** Max time past “now” that may be loaded / panned (hard ceiling per bucket view). */
export const FUTURE_PAD_MS: Record<TimelineBucketKey, number> = {
  "5m": 30 * 60 * 1000,
  "30m": 3 * 60 * 60 * 1000,
  "1h": 5 * 60 * 60 * 1000,
  "1d": 2 * DAY_MS,
  "1month": 0,
};

/** Past span before “now” on first load (sub-hour buckets use ms, not days). */
const PAST_PAD_MS: Record<TimelineBucketKey, number> = {
  "5m": 2 * DAY_MS,
  "30m": 7 * DAY_MS,
  "1h": 7 * DAY_MS,
  "1d": 30 * DAY_MS,
  "1month": 0,
};

export function floorBucketMs(
  ms: number,
  bucket: TimelineBucketKey,
  timeZone: string = DEFAULT_TEAM_TIMEZONE,
): number {
  const tz = normalizeTimeZone(timeZone);
  if (bucket === "1month") return startOfZonedMonthMs(ms, tz);
  if (bucket === "1d") return startOfZonedDayMs(ms, tz);
  if (bucket === "30m") {
    return Math.floor(ms / (30 * 60 * 1000)) * (30 * 60 * 1000);
  }
  if (bucket === "5m") {
    return Math.floor(ms / (5 * 60 * 1000)) * (5 * 60 * 1000);
  }
  return Math.floor(ms / 3600000) * 3600000;
}

/** Latest allowed end timestamp for the loaded timeline window. */
export function maxFutureEndMs(
  bucket: TimelineBucketKey,
  nowMs: number = Date.now(),
  timeZone: string = DEFAULT_TEAM_TIMEZONE,
): number {
  const tz = normalizeTimeZone(timeZone);
  if (bucket === "1month") {
    const cur = floorBucketMs(nowMs, bucket, tz);
    return endOfZonedMonthMs(addZonedMonths(cur, 1, tz), tz);
  }
  return nowMs + FUTURE_PAD_MS[bucket];
}

export type HistoryBounds = { minMs: number | null; maxMs: number | null };

export type TimeRange = { start: string; end: string };

function clampRange(
  startMs: number,
  endMs: number,
  bounds: HistoryBounds,
  bucket: TimelineBucketKey,
  timeZone: string,
): { startMs: number; endMs: number } {
  const tz = normalizeTimeZone(timeZone);
  const width = Math.max(endMs - startMs, DAY_MS);
  let s = startMs;
  let e = endMs;

  if (bounds.minMs != null && s < bounds.minMs) {
    s = floorBucketMs(bounds.minMs, bucket, tz);
    e = s + width;
  }
  const futureCap = maxFutureEndMs(bucket, Date.now(), tz);
  if (e > futureCap) {
    e = futureCap;
    s = Math.max(bounds.minMs ?? s, e - width);
  }

  if (bounds.maxMs != null && e > bounds.maxMs + DAY_MS * 400) {
    e = bounds.maxMs + DAY_MS;
    s = Math.max(bounds.minMs ?? s, e - width);
  }
  if (s >= e) e = s + DAY_MS;
  return { startMs: s, endMs: e };
}

function toRange(startMs: number, endMs: number): TimeRange {
  return { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() };
}

export function dataAwareInitialRange(
  bucket: TimelineBucketKey,
  bounds: HistoryBounds,
  timeZone: string = DEFAULT_TEAM_TIMEZONE,
): TimeRange {
  const tz = normalizeTimeZone(timeZone);
  if (bounds.minMs == null || bounds.maxMs == null) {
    return initialRange(bucket, bounds, tz);
  }

  const now = Date.now();
  const dataEnd = Math.max(bounds.maxMs, now);

  if (bucket === "1month") {
    const startMs = addZonedMonths(floorBucketMs(bounds.minMs, bucket, tz), -1, tz);
    const endMs = endOfZonedMonthMs(addZonedMonths(floorBucketMs(dataEnd, bucket, tz), 1, tz), tz);
    const c = clampRange(startMs, endMs, bounds, bucket, tz);
    return toRange(c.startMs, c.endMs);
  }

  const padBefore = bucket === "1d" ? 3 * DAY_MS : DAY_MS;
  const startMs = floorBucketMs(bounds.minMs, bucket, tz) - padBefore;
  const endMs = maxFutureEndMs(bucket, dataEnd + DAY_MS, tz);
  const c = clampRange(startMs, endMs, bounds, bucket, tz);
  return toRange(c.startMs, c.endMs);
}

export function initialRange(
  bucket: TimelineBucketKey,
  bounds: HistoryBounds = { minMs: null, maxMs: null },
  timeZone: string = DEFAULT_TEAM_TIMEZONE,
): TimeRange {
  const tz = normalizeTimeZone(timeZone);
  const now = Date.now();
  if (bucket === "1month") {
    const { initialHalfMonths } = VIEW_WINDOW["1month"];
    const cur = floorBucketMs(now, bucket, tz);
    const startMs = addZonedMonths(cur, -initialHalfMonths, tz);
    const endMs = endOfZonedMonthMs(addZonedMonths(cur, 1, tz), tz);
    const c = clampRange(startMs, endMs, bounds, bucket, tz);
    return toRange(c.startMs, c.endMs);
  }
  const startMs = now - PAST_PAD_MS[bucket];
  const endMs = maxFutureEndMs(bucket, now, tz);
  const c = clampRange(startMs, endMs, bounds, bucket, tz);
  return toRange(c.startMs, c.endMs);
}

export function shiftLoadedRange(
  current: TimeRange,
  direction: "older" | "newer",
  bucket: TimelineBucketKey,
  bounds: HistoryBounds = { minMs: null, maxMs: null },
  timeZone: string = DEFAULT_TEAM_TIMEZONE,
): TimeRange {
  const tz = normalizeTimeZone(timeZone);
  const startMs = new Date(current.start).getTime();
  const endMs = new Date(current.end).getTime();
  const width = endMs - startMs;
  const sign = direction === "older" ? -1 : 1;

  if (bucket === "1month") {
    const step = VIEW_WINDOW["1month"].panStepMonths;
    const newStart = addZonedMonths(floorBucketMs(startMs, bucket, tz), sign * step, tz);
    const newEnd = endOfZonedMonthMs(
      addZonedMonths(floorBucketMs(endMs, bucket, tz), sign * step, tz),
      tz,
    );
    const c = clampRange(newStart, newEnd, bounds, bucket, tz);
    return toRange(c.startMs, c.endMs);
  }

  const deltaMs = sign * VIEW_WINDOW[bucket].panStepDays * DAY_MS;
  let newStartMs = startMs + deltaMs;
  let newEndMs = endMs + deltaMs;

  if (bounds.minMs != null && newStartMs < bounds.minMs) {
    newStartMs = floorBucketMs(bounds.minMs, bucket, tz);
    newEndMs = newStartMs + width;
  }
  const futureCap = maxFutureEndMs(bucket, Date.now(), tz);
  if (newEndMs > futureCap) {
    newEndMs = futureCap;
    newStartMs = Math.max(bounds.minMs ?? newStartMs, newEndMs - width);
  }

  return toRange(newStartMs, newEndMs);
}

/** Max chart load window per bucket (keeps API responses bounded on large teams). */
export const MAX_LOAD_BUCKETS: Record<TimelineBucketKey, number> = {
  "5m": 576,
  "30m": 336,
  "1h": 168,
  "1d": 120,
  "1month": 36,
};

/** Trim an oversized range to the most recent buckets (pan older loads more). */
export function capTimelineLoadRange(
  range: TimeRange,
  bucket: TimelineBucketKey,
  timeZone: string = DEFAULT_TEAM_TIMEZONE,
): TimeRange {
  const tz = normalizeTimeZone(timeZone);
  const maxBuckets = MAX_LOAD_BUCKETS[bucket];
  let cur = floorBucketMs(new Date(range.end).getTime(), bucket, tz);
  const targetStart = floorBucketMs(new Date(range.start).getTime(), bucket, tz);
  let count = 0;
  let oldest = cur;
  while (count < maxBuckets) {
    oldest = cur;
    if (cur <= targetStart) break;
    count++;
    if (bucket === "1month") {
      cur = addZonedMonths(cur, -1, tz);
    } else if (bucket === "1d") {
      cur -= DAY_MS;
    } else if (bucket === "1h") {
      cur -= 3600000;
    } else if (bucket === "30m") {
      cur -= 30 * 60 * 1000;
    } else {
      cur -= 5 * 60 * 1000;
    }
  }
  const startMs = Math.max(targetStart, oldest);
  const endMs = new Date(range.end).getTime();
  if (startMs >= endMs) return range;
  return toRange(startMs, endMs);
}

export function parseHistoryBounds(
  historyStart?: string | null,
  historyEnd?: string | null,
): HistoryBounds {
  return {
    minMs: historyStart ? new Date(historyStart).getTime() : null,
    maxMs: historyEnd ? new Date(historyEnd).getTime() : null,
  };
}

export function canPanOlder(
  loadedStartIso: string,
  bounds: HistoryBounds,
  bucket: TimelineBucketKey,
  timeZone: string = DEFAULT_TEAM_TIMEZONE,
): boolean {
  const tz = normalizeTimeZone(timeZone);
  if (bounds.minMs == null) return false;
  return floorBucketMs(new Date(loadedStartIso).getTime(), bucket, tz) > bounds.minMs + 1000;
}

export function canPanNewer(
  loadedEndIso: string,
  bounds: HistoryBounds,
  bucket: TimelineBucketKey,
  timeZone: string = DEFAULT_TEAM_TIMEZONE,
): boolean {
  const tz = normalizeTimeZone(timeZone);
  const endMs = new Date(loadedEndIso).getTime();
  if (endMs >= maxFutureEndMs(bucket, Date.now(), tz) - 1000) return false;
  if (bounds.maxMs == null) return false;
  if (bucket === "1month") {
    return endMs < endOfZonedMonthMs(floorBucketMs(bounds.maxMs, bucket, tz), tz);
  }
  return endMs < bounds.maxMs + (bucket === "1d" ? DAY_MS : 3600000);
}

export type ZoomRange = { start: number; end: number };

export function visibleAbsoluteRange(
  loaded: TimeRange,
  zoom: ZoomRange,
): { startMs: number; endMs: number } {
  const startMs = new Date(loaded.start).getTime();
  const endMs = new Date(loaded.end).getTime();
  const span = Math.max(endMs - startMs, 1);
  return {
    startMs: startMs + (zoom.start / 100) * span,
    endMs: startMs + (zoom.end / 100) * span,
  };
}

export function zoomPreservingVisibleRange(
  _newLoaded: TimeRange,
  categories: string[],
  visible: { startMs: number; endMs: number },
  maxVisibleBars: number,
): ZoomRange {
  const n = categories.length;
  if (n <= 1) return { start: 0, end: 100 };

  let startIdx = 0;
  let endIdx = n - 1;
  for (let i = 0; i < n; i++) {
    if (new Date(categories[i]).getTime() >= visible.startMs) {
      startIdx = i;
      break;
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    if (new Date(categories[i]).getTime() <= visible.endMs) {
      endIdx = i;
      break;
    }
  }
  if (endIdx < startIdx) endIdx = startIdx;

  const maxSpan = n <= maxVisibleBars ? 100 : (maxVisibleBars / n) * 100;
  let startPct = n > 1 ? (startIdx / (n - 1)) * 100 : 0;
  let endPct = n > 1 ? ((endIdx + 1) / n) * 100 : 100;
  let width = endPct - startPct;

  if (width > maxSpan) {
    const mid = (startPct + endPct) / 2;
    startPct = mid - maxSpan / 2;
    endPct = mid + maxSpan / 2;
    width = maxSpan;
  }

  startPct = Math.max(0, Math.min(100 - maxSpan, startPct));
  endPct = Math.min(100, Math.max(startPct + width, endPct));

  return { start: startPct, end: endPct };
}
