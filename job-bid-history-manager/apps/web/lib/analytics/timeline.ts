import type { JobFilters, TimelineBucketKey, TimelineResponse } from "@jbhm/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildTimelineFromRows, type TimelineJobRow } from "@/lib/analytics/build-timeline";
import { createClient } from "@/lib/supabase/server";
import { getTeamTimezone } from "@/lib/teams/team-timezone";

const TIMELINE_PAGE_SIZE = 1000;

/** Supabase caps at 1000 rows per request — paginate so the chart sees the whole team board. */
export async function fetchAllJobsForTimeline(
  supabase: SupabaseClient,
  teamId: string,
  range?: { start?: string; end?: string },
): Promise<TimelineJobRow[]> {
  const all: TimelineJobRow[] = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from("jobs")
      .select("captured_at, captured_by, company_name")
      .eq("team_id", teamId)
      .is("deleted_at", null)
      .order("captured_at", { ascending: true });
    if (range?.start) query = query.gte("captured_at", range.start);
    if (range?.end) query = query.lte("captured_at", range.end);

    const { data, error } = await query.range(from, from + TIMELINE_PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    const batch = (data ?? []) as TimelineJobRow[];
    all.push(...batch);
    if (batch.length < TIMELINE_PAGE_SIZE) break;
    from += TIMELINE_PAGE_SIZE;
  }

  return all;
}

/** Team-wide first/last capture (for pan limits) without loading every row. */
export async function fetchTimelineHistoryBounds(
  supabase: SupabaseClient,
  teamId: string,
): Promise<{ min: string | null; max: string | null }> {
  const base = () =>
    supabase
      .from("jobs")
      .select("captured_at")
      .eq("team_id", teamId)
      .is("deleted_at", null);

  const [{ data: oldest }, { data: newest }] = await Promise.all([
    base().order("captured_at", { ascending: true }).limit(1).maybeSingle(),
    base().order("captured_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return {
    min: oldest?.captured_at ?? null,
    max: newest?.captured_at ?? null,
  };
}

export async function buildTimeline(
  teamId: string,
  bucket: TimelineBucketKey,
  start?: string,
  end?: string,
  tableHighlight?: JobFilters,
): Promise<TimelineResponse> {
  const supabase = await createClient();
  const [timeZone, jobs, bounds] = await Promise.all([
    getTeamTimezone(supabase, teamId),
    fetchAllJobsForTimeline(supabase, teamId, { start, end }),
    fetchTimelineHistoryBounds(supabase, teamId),
  ]);
  const result = buildTimelineFromRows(jobs, bucket, start, end, tableHighlight, timeZone);
  return {
    ...result,
    history_start: bounds.min ?? result.history_start,
    history_end: bounds.max ?? result.history_end,
  };
}
