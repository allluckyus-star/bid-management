import type { TimelineBucketKey } from "@jbhm/shared";

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

/** Latest allowed end timestamp for the loaded timeline window. */
export function maxFutureEndMs(
  bucket: TimelineBucketKey,
  nowMs: number = Date.now(),
): number {
  if (bucket === "1month") {
    const cur = floorBucketMs(nowMs, bucket);
    return endOfUtcMonth(addUtcMonths(cur, 1));
  }
  return nowMs + FUTURE_PAD_MS[bucket];
}

/** @deprecated use maxFutureEndMs */
export const minFutureEndMs = maxFutureEndMs;

export type HistoryBounds = { minMs: number | null; maxMs: number | null };

export type TimeRange = { start: string; end: string };

export function floorBucketMs(ms: number, bucket: TimelineBucketKey): number {
  const d = new Date(ms);
  if (bucket === "1month") {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  }
  if (bucket === "1d") {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
  }
  if (bucket === "30m") {
    return Math.floor(ms / (30 * 60 * 1000)) * (30 * 60 * 1000);
  }
  if (bucket === "5m") {
    return Math.floor(ms / (5 * 60 * 1000)) * (5 * 60 * 1000);
  }
  return Math.floor(ms / 3600000) * 3600000;
}

export function addUtcMonths(ms: number, months: number): number {
  const d = new Date(ms);
  const m = d.getUTCMonth() + months;
  const y = d.getUTCFullYear() + Math.floor(m / 12);
  return Date.UTC(y, ((m % 12) + 12) % 12, 1);
}

function endOfUtcMonth(monthStartMs: number): number {
  const d = new Date(monthStartMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999);
}

function clampRange(
  startMs: number,
  endMs: number,
  bounds: HistoryBounds,
  bucket: TimelineBucketKey,
): { startMs: number; endMs: number } {
  const width = Math.max(endMs - startMs, DAY_MS);
  let s = startMs;
  let e = endMs;

  if (bounds.minMs != null && s < bounds.minMs) {
    s = floorBucketMs(bounds.minMs, bucket);
    e = s + width;
  }
  const futureCap = maxFutureEndMs(bucket);
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

/**
 * Loaded window that includes all stored bids (with padding), not only “last N days from now”.
 * Panning at the edges still shifts this window in fixed steps.
 */
export function dataAwareInitialRange(
  bucket: TimelineBucketKey,
  bounds: HistoryBounds,
): TimeRange {
  if (bounds.minMs == null || bounds.maxMs == null) {
    return initialRange(bucket, bounds);
  }

  const now = Date.now();
  const dataEnd = Math.max(bounds.maxMs, now);

  if (bucket === "1month") {
    const startMs = addUtcMonths(floorBucketMs(bounds.minMs, bucket), -1);
    const endMs = endOfUtcMonth(addUtcMonths(floorBucketMs(dataEnd, bucket), 1));
    const c = clampRange(startMs, endMs, bounds, bucket);
    return toRange(c.startMs, c.endMs);
  }

  const padBefore = bucket === "1d" ? 3 * DAY_MS : DAY_MS;
  const startMs = floorBucketMs(bounds.minMs, bucket) - padBefore;
  const endMs = maxFutureEndMs(bucket, dataEnd + DAY_MS);
  const c = clampRange(startMs, endMs, bounds, bucket);
  return toRange(c.startMs, c.endMs);
}

/** First load: past window through now + bucket-specific future pad (empty buckets allowed). */
export function initialRange(bucket: TimelineBucketKey, bounds: HistoryBounds = { minMs: null, maxMs: null }): TimeRange {
  const now = Date.now();
  if (bucket === "1month") {
    const { initialHalfMonths } = VIEW_WINDOW["1month"];
    const cur = floorBucketMs(now, bucket);
    const startMs = addUtcMonths(cur, -initialHalfMonths);
    const endMs = endOfUtcMonth(addUtcMonths(cur, 1));
    const c = clampRange(startMs, endMs, bounds, bucket);
    return toRange(c.startMs, c.endMs);
  }
  const startMs = now - PAST_PAD_MS[bucket];
  const endMs = maxFutureEndMs(bucket, now);
  const c = clampRange(startMs, endMs, bounds, bucket);
  return toRange(c.startMs, c.endMs);
}

/**
 * Shift the whole window by one step; width unchanged.
 * e.g. (x, y) → (x−3d, y−3d) on left edge; slider is moved so the chart view stays the same.
 */
export function shiftLoadedRange(
  current: TimeRange,
  direction: "older" | "newer",
  bucket: TimelineBucketKey,
  bounds: HistoryBounds = { minMs: null, maxMs: null },
): TimeRange {
  const startMs = new Date(current.start).getTime();
  const endMs = new Date(current.end).getTime();
  const width = endMs - startMs;
  const sign = direction === "older" ? -1 : 1;

  if (bucket === "1month") {
    const step = VIEW_WINDOW["1month"].panStepMonths;
    const newStart = addUtcMonths(floorBucketMs(startMs, bucket), sign * step);
    const newEnd = endOfUtcMonth(addUtcMonths(floorBucketMs(endMs, bucket), sign * step));
    const c = clampRange(newStart, newEnd, bounds, bucket);
    return toRange(c.startMs, c.endMs);
  }

  const deltaMs = sign * VIEW_WINDOW[bucket].panStepDays * DAY_MS;
  let newStartMs = startMs + deltaMs;
  let newEndMs = endMs + deltaMs;

  if (bounds.minMs != null && newStartMs < bounds.minMs) {
    newStartMs = floorBucketMs(bounds.minMs, bucket);
    newEndMs = newStartMs + width;
  }
  const futureCap = maxFutureEndMs(bucket);
  if (newEndMs > futureCap) {
    newEndMs = futureCap;
    newStartMs = Math.max(bounds.minMs ?? newStartMs, newEndMs - width);
  }

  return toRange(newStartMs, newEndMs);
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

export function canPanOlder(loadedStartIso: string, bounds: HistoryBounds, bucket: TimelineBucketKey): boolean {
  if (bounds.minMs == null) return false;
  return floorBucketMs(new Date(loadedStartIso).getTime(), bucket) > bounds.minMs + 1000;
}

export function canPanNewer(loadedEndIso: string, bounds: HistoryBounds, bucket: TimelineBucketKey): boolean {
  const endMs = new Date(loadedEndIso).getTime();
  if (endMs >= maxFutureEndMs(bucket) - 1000) return false;
  if (bounds.maxMs == null) return false;
  if (bucket === "1month") {
    return endMs < endOfUtcMonth(floorBucketMs(bounds.maxMs, bucket));
  }
  return endMs < bounds.maxMs + (bucket === "1d" ? DAY_MS : 3600000);
}

export type ZoomRange = { start: number; end: number };

/** Absolute time span currently shown on the chart (from slider %). */
export function visibleAbsoluteRange(loaded: TimeRange, zoom: ZoomRange): { startMs: number; endMs: number } {
  const startMs = new Date(loaded.start).getTime();
  const endMs = new Date(loaded.end).getTime();
  const span = Math.max(endMs - startMs, 1);
  return {
    startMs: startMs + (zoom.start / 100) * span,
    endMs: startMs + (zoom.end / 100) * span,
  };
}

/**
 * After (x,y)→(x−3d,y−3d), move the slider so the same bucket columns stay in view.
 */
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
