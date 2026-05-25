import { NextResponse } from "next/server";

import { withTeamRoute } from "@/lib/api/with-team-route";
import { fetchDashboardSummary } from "@/lib/jobs/dashboard-summary";

export async function GET(request: Request) {
  return withTeamRoute(request, async (teamId) => {
    try {
      return NextResponse.json(await fetchDashboardSummary(teamId));
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed" },
        { status: 500 },
      );
    }
  });
}
