import type { JobFilters, TimelineBucketKey, TimelineResponse } from "@jbhm/shared";

import { createClient } from "@/lib/supabase/server";

type JobRow = {
  captured_at: string;
  captured_by: string | null;
  company_name: string | null;
};

function floorBucket(iso: string, bucket: TimelineBucketKey): string {
  const d = new Date(iso);
  if (bucket === "1month") {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
  }
  if (bucket === "1d") {
    const local = new Date(d);
    local.setHours(0, 0, 0, 0);
    return local.toISOString().slice(0, 10) + "T00:00:00";
  }
  const h = 3600 * 1000;
  const t = Math.floor(d.getTime() / h) * h;
  return new Date(t).toISOString();
}

function addBucket(slot: string, bucket: TimelineBucketKey): string {
  const d = new Date(slot);
  if (bucket === "1month") {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
  }
  if (bucket === "1d") {
    return new Date(d.getTime() + 86400000).toISOString();
  }
  return new Date(d.getTime() + 3600000).toISOString();
}

function jobMatchesHighlight(
  job: JobRow,
  filters?: JobFilters,
): boolean {
  if (!filters) return true;
  if (filters.captured_by && job.captured_by !== filters.captured_by) return false;
  return true;
}

export async function buildTimeline(
  bucket: TimelineBucketKey,
  start?: string,
  end?: string,
  tableHighlight?: JobFilters,
): Promise<TimelineResponse> {
  const supabase = await createClient();
  let query = supabase
    .from("jobs")
    .select("captured_at, captured_by, company_name")
    .is("deleted_at", null);

  const now = new Date();
  const endDt = end ? new Date(end) : now;
  const startDt = start
    ? new Date(start)
    : new Date(endDt.getTime() - (bucket === "1month" ? 180 : bucket === "1d" ? 30 : 7) * 86400000);

  query = query.gte("captured_at", startDt.toISOString()).lte("captured_at", endDt.toISOString());

  const { data: jobs, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (jobs ?? []) as JobRow[];
  const users = [...new Set(rows.map((r) => r.captured_by || "Unknown"))].sort();

  const slotSet = new Set<string>();
  let cur = floorBucket(startDt.toISOString(), bucket);
  const endSlot = floorBucket(endDt.toISOString(), bucket);
  while (cur <= endSlot) {
    slotSet.add(cur);
    cur = addBucket(cur, bucket);
  }
  const slots = [...slotSet].sort();

  const counts = new Map<string, number>();
  const highlight = new Map<string, number>();
  const companies = new Map<string, Map<string, number>>();

  for (const job of rows) {
    const user = job.captured_by || "Unknown";
    const slot = floorBucket(job.captured_at, bucket);
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

  const series = users.map((captured_by) => ({
    captured_by,
    buckets: slots.map((bucket_start) => {
      const key = `${bucket_start}|${captured_by}`;
      const top = [...(companies.get(key)?.entries() ?? [])]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([company, count]) => ({ company, count }));
      return {
        bucket_start,
        bucket_end: addBucket(bucket_start, bucket),
        count: counts.get(key) ?? 0,
        table_count: highlight.get(key) ?? 0,
        top_companies: top,
      };
    }),
  }));

  const times = rows.map((r) => r.captured_at).sort();

  return {
    bucket,
    start: startDt.toISOString(),
    end: endDt.toISOString(),
    history_start: times[0] ?? null,
    history_end: times[times.length - 1] ?? null,
    series,
  };
}
