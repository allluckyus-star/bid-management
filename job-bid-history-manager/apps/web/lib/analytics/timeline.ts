import type { JobFilters, TimelineBucketKey, TimelineResponse } from "@jbhm/shared";

import { buildTimelineFromRows } from "@/lib/analytics/build-timeline";
import { createClient } from "@/lib/supabase/server";

export async function buildTimeline(
  bucket: TimelineBucketKey,
  start?: string,
  end?: string,
  tableHighlight?: JobFilters,
): Promise<TimelineResponse> {
  const supabase = await createClient();
  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("captured_at, captured_by, company_name")
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  return buildTimelineFromRows(jobs ?? [], bucket, start, end, tableHighlight);
}
