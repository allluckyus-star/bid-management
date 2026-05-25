import { NextResponse } from "next/server";

import { withTeamRoute } from "@/lib/api/with-team-route";
import { listJobsFromRequest } from "@/lib/jobs/list-jobs";

export async function GET(request: Request) {
  return withTeamRoute(request, async (teamId) => {
    try {
      const result = await listJobsFromRequest(request, teamId);
      return NextResponse.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load jobs";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
