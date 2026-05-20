import type { TimelineBucketKey } from "@jbhm/shared";

/** Matches API MAX_TIMELINE_BUCKETS spans */
export const TIMELINE_WINDOW_MONTHS = 120;

const WINDOW_MS: Record<Exclude<TimelineBucketKey, "1month">, number> = {
  "1h": 336 * 3600 * 1000,
  "1d": 366 * 86400 * 1000,
};

export type WindowSplit = { before: number; after: number };

export const WINDOW_SPLIT_OLDER: WindowSplit = { before: 0.25, after: 0.75 };
export const WINDOW_SPLIT_NEWER: WindowSplit = { before: 0.75, after: 0.25 };
export const WINDOW_SPLIT_INITIAL: WindowSplit = { before: 0.5, after: 0.5 };

export type HistoryBounds = { minMs: number | null; maxMs: number | null };

export function floorBucketMs(ms: number, bucket: TimelineBucketKey): number {
  const d = new Date(ms);
  if (bucket === "1month") {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  }
  if (bucket === "1d") {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  return Math.floor(ms / 3600000) * 3600000;
}

export function addUtcMonths(ms: number, months: number): number {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  return Date.UTC(y + Math.floor(m / 12), ((m % 12) + 12) % 12, 1);
}

function endOfUtcMonth(monthStartMs: number): number {
  const d = new Date(monthStartMs);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  return Date.UTC(y, m + 1, 0, 23, 59, 59, 999);
}

function bucketDurationMs(bucket: TimelineBucketKey): number {
  if (bucket === "1month") return 30 * 86400000;
  if (bucket === "1d") return 86400000;
  return 3600000;
}

export function rangeAroundAnchor(
  anchorMs: number,
  bucket: TimelineBucketKey,
  split: WindowSplit,
  bounds?: HistoryBounds,
): { start: string; end: string } {
  const anchor = floorBucketMs(anchorMs, bucket);
  let startMs: number;
  let endMs: number;

  if (bucket === "1month") {
    const beforeM = Math.max(1, Math.round(TIMELINE_WINDOW_MONTHS * split.before));
    const afterM = Math.max(1, Math.round(TIMELINE_WINDOW_MONTHS * split.after));
    startMs = addUtcMonths(anchor, -beforeM);
    endMs = endOfUtcMonth(addUtcMonths(anchor, afterM - 1));
  } else {
    const total = WINDOW_MS[bucket];
    startMs = anchor - split.before * total;
    endMs = anchor + split.after * total;
  }

  if (bounds?.minMs != null) startMs = Math.max(bounds.minMs, startMs);
  if (bounds?.maxMs != null) {
    const maxEnd =
      bucket === "1month"
        ? endOfUtcMonth(floorBucketMs(bounds.maxMs, bucket))
        : bounds.maxMs + bucketDurationMs(bucket);
    endMs = Math.min(maxEnd, endMs);
  }

  if (bucket !== "1month") {
    const total = WINDOW_MS[bucket];
    if (endMs - startMs < total * 0.85) {
      if (bounds?.minMs != null && startMs <= bounds.minMs + 1000) {
        endMs = Math.min(bounds.maxMs != null ? bounds.maxMs + total : endMs, startMs + total);
      } else if (bounds?.maxMs != null && endMs >= bounds.maxMs) {
        startMs = Math.max(bounds.minMs ?? startMs, endMs - total);
      }
    }
  }

  return { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() };
}

export function initialRange(
  bucket: TimelineBucketKey,
  bounds?: HistoryBounds,
): { start: string; end: string } {
  return rangeAroundAnchor(Date.now(), bucket, WINDOW_SPLIT_INITIAL, bounds);
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
  if (bounds.maxMs == null) return false;
  return new Date(loadedEndIso).getTime() < bounds.maxMs + bucketDurationMs(bucket);
}

export function findCategoryIndex(categories: string[], anchorIso: string): number {
  const idx = categories.indexOf(anchorIso);
  if (idx >= 0) return idx;
  const target = new Date(anchorIso).getTime();
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < categories.length; i++) {
    const dist = Math.abs(new Date(categories[i]).getTime() - target);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

export type ZoomRange = { start: number; end: number };

export function zoomWithAnchorAt(
  categoryCount: number,
  anchorIdx: number,
  anchorPosition: number,
  maxVisible: number,
): ZoomRange {
  const n = categoryCount;
  if (n <= 1) return { start: 0, end: 100 };
  const span = n <= maxVisible ? 100 : (maxVisible / n) * 100;
  const anchorPct = n > 1 ? (anchorIdx / (n - 1)) * 100 : 0;
  let start = anchorPct - anchorPosition * span;
  start = Math.max(0, Math.min(100 - span, start));
  return { start, end: start + span };
}
