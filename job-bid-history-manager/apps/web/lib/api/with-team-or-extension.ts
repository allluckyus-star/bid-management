import { NextResponse } from "next/server";

import { resolveUserIdFromBearer } from "@/lib/auth/extension-token";
import {
  parseTeamIdFromRequest,
  requireAuthUser,
  requireTeamMember,
  teamAccessToResponse,
} from "@/lib/teams/access";

export type TeamAuthContext = {
  userId: string;
  teamId: string;
  viaExtension: boolean;
};

/** Session team member or Bearer extension token (token team must match ?teamId=). */
export async function resolveTeamAuth(request: Request): Promise<TeamAuthContext> {
  const teamId = parseTeamIdFromRequest(request);

  const bearer = await resolveUserIdFromBearer(request.headers.get("authorization"));
  if (bearer) {
    if (bearer.teamId !== teamId) {
      throw new Error("Token team does not match request team");
    }
    return { userId: bearer.userId, teamId, viaExtension: true };
  }

  await requireTeamMember(teamId);
  const { user } = await requireAuthUser();
  return { userId: user.id, teamId, viaExtension: false };
}

export async function withTeamOrExtensionRoute(
  request: Request,
  handler: (ctx: TeamAuthContext) => Promise<Response>,
): Promise<Response> {
  try {
    const ctx = await resolveTeamAuth(request);
    return await handler(ctx);
  } catch (err) {
    const res = teamAccessToResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "Failed";
    const status = msg.includes("team") || msg.includes("Token") ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
