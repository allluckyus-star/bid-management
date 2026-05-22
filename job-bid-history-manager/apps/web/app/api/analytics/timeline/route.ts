import { NextResponse } from "next/server";

import { buildTimeline } from "@/lib/analytics/timeline";
import { parseJobFiltersFromSearchParams } from "@/lib/jobs/query-params";
import type { TimelineBucketKey } from "@jbhm/shared";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const bucket = (url.searchParams.get("bucket") ?? "1d") as TimelineBucketKey;
  const start = url.searchParams.get("start") ?? undefined;
  const end = url.searchParams.get("end") ?? undefined;
  const highlight = parseJobFiltersFromSearchParams(url.searchParams);

  try {
    const data = await buildTimeline(bucket, start, end, highlight);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
