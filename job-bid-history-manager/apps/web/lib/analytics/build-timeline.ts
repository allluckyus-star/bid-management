import type { JobFilters, TimelineBucketKey, TimelineResponse } from "@jbhm/shared";

import {
  addBucket,
  floorBucket,
  jobTimestampInRange,
} from "@/lib/analytics/timeline-buckets";
import { DEFAULT_TEAM_TIMEZONE, normalizeTimeZone } from "@/lib/datetime/zoned";
import {
  capTimelineLoadRange,
  MAX_LOAD_BUCKETS,
} from "@/lib/jbhm/timeline-window";

export type TimelineJobRow = {
  captured_at: string;
  captured_by: string | null;
  company_name: string | null;
};

function jobMatchesHighlight(job: TimelineJobRow, filters?: JobFilters): boolean {
  if (!filters) return true;
  if (filters.captured_by && job.captured_by !== filters.captured_by) return false;
  return true;
}

/** Aggregate pre-fetched job rows into a timeline (client or server). */
export function buildTimelineFromRows(
  allRows: TimelineJobRow[],
  bucket: TimelineBucketKey,
  start?: string,
  end?: string,
  tableHighlight?: JobFilters,
  timeZone?: string,
): TimelineResponse {
  const tz = normalizeTimeZone(timeZone ?? DEFAULT_TEAM_TIMEZONE);

  if (allRows.length === 0) {
    const now = new Date();
    const endDt = end ? new Date(end) : now;
    const startDt = start
      ? new Date(start)
      : new Date(endDt.getTime() - 30 * 86400000);
    const capped = capTimelineLoadRange(
      { start: startDt.toISOString(), end: endDt.toISOString() },
      bucket,
      tz,
    );
    return {
      bucket,
      timezone: tz,
      start: capped.start,
      end: capped.end,
      history_start: null,
      history_end: null,
      series: [],
    };
  }

  const now = new Date();
  const endDt = end ? new Date(end) : now;
  const startDt = start
    ? new Date(start)
    : new Date(
        endDt.getTime() -
          (bucket === "1month"
            ? 180
            : bucket === "1d"
              ? 30
              : bucket === "30m"
                ? 14
                : bucket === "5m"
                  ? 3
                  : 7) *
            86400000,
      );

  const capped = capTimelineLoadRange(
    { start: startDt.toISOString(), end: endDt.toISOString() },
    bucket,
    tz,
  );
  const startIso = capped.start;
  const endIso = capped.end;

  const rows = allRows.filter((r) => jobTimestampInRange(r.captured_at, startIso, endIso));

  const users = [
    ...new Set(allRows.map((r) => r.captured_by || "Unknown")),
  ].sort();

  const slotSet = new Set<string>();
  let cur = floorBucket(startIso, bucket, tz);
  const endSlot = floorBucket(endIso, bucket, tz);
  const maxSlots = MAX_LOAD_BUCKETS[bucket];
  let slotCount = 0;
  while (cur <= endSlot && slotCount < maxSlots) {
    slotSet.add(cur);
    cur = addBucket(cur, bucket, tz);
    slotCount++;
  }

  const counts = new Map<string, number>();
  const highlight = new Map<string, number>();
  const companies = new Map<string, Map<string, number>>();

  for (const job of rows) {
    const user = job.captured_by || "Unknown";
    const slot = floorBucket(job.captured_at, bucket, tz);
    slotSet.add(slot);
    const key = `${slot}|${user}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (jobMatchesHighlight(job, tableHighlight)) {
      highlight.set(key, (highlight.get(key) ?? 0) + 1);
    }
    const co = (job.company_name || "Unknown").trim() || "Unknown";
    if (!companies.has(key)) companies.set(key, new Map());
    const cm = companies.get(key)!;
    cm.set(co, (cm.get(co) ?? 0) + 1);
  }

  const slots = [...slotSet].sort();

  const buildBuckets = (captured_by: string) =>
    slots.map((bucket_start) => {
      const key = `${bucket_start}|${captured_by}`;
      const top = [...(companies.get(key)?.entries() ?? [])]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([company, count]) => ({ company, count }));
      return {
        bucket_start,
        bucket_end: addBucket(bucket_start, bucket, tz),
        count: counts.get(key) ?? 0,
        table_count: highlight.get(key) ?? 0,
        top_companies: top,
      };
    });

  const series =
    users.length > 0
      ? users.map((captured_by) => ({
          captured_by,
          buckets: buildBuckets(captured_by),
        }))
      : slots.length > 0
        ? [{ captured_by: "—", buckets: buildBuckets("—") }]
        : [];

  const times = allRows.map((r) => r.captured_at).sort();

  return {
    bucket,
    timezone: tz,
    start: startIso,
    end: endIso,
    history_start: times[0] ?? null,
    history_end: times[times.length - 1] ?? null,
    series,
  };
}
