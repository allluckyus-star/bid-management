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
): Promise<TimelineJobRow[]> {
  const all: TimelineJobRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("jobs")
      .select("captured_at, captured_by, company_name")
      .eq("team_id", teamId)
      .is("deleted_at", null)
      .order("captured_at", { ascending: true })
      .range(from, from + TIMELINE_PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    const batch = (data ?? []) as TimelineJobRow[];
    all.push(...batch);
    if (batch.length < TIMELINE_PAGE_SIZE) break;
    from += TIMELINE_PAGE_SIZE;
  }

  return all;
}

export async function buildTimeline(
  teamId: string,
  bucket: TimelineBucketKey,
  start?: string,
  end?: string,
  tableHighlight?: JobFilters,
): Promise<TimelineResponse> {
  const supabase = await createClient();
  const [jobs, timeZone] = await Promise.all([
    fetchAllJobsForTimeline(supabase, teamId),
    getTeamTimezone(supabase, teamId),
  ]);
  return buildTimelineFromRows(jobs, bucket, start, end, tableHighlight, timeZone);
}
