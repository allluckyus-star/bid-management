import { NextResponse } from "next/server";

import {
  parseTeamIdFromRequest,
  requireTeamMember,
  teamAccessToResponse,
} from "@/lib/teams/access";

export async function withTeamRoute(
  request: Request,
  handler: (teamId: string) => Promise<Response>,
): Promise<Response> {
  try {
    const teamId = parseTeamIdFromRequest(request);
    await requireTeamMember(teamId);
    return await handler(teamId);
  } catch (err) {
    const res = teamAccessToResponse(err);
    if (res) return res;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
