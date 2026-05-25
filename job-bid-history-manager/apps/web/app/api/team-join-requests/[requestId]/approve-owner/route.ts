import { NextResponse } from "next/server";

import { requireAuthUser, teamAccessToResponse } from "@/lib/teams/access";
import { approveJoinRequestAsOwner } from "@/lib/teams/approve-join-request";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";

type Params = { params: Promise<{ requestId: string }> };

/** Owner approves a pending join request from the Team dialog (no email link). */
export async function POST(_request: Request, { params }: Params) {
  try {
    const { requestId } = await params;
    const { user } = await requireAuthUser();

    if (!hasServiceRoleKey()) {
      return NextResponse.json(
        { error: "Server missing SUPABASE_SERVICE_ROLE_KEY" },
        { status: 503 },
      );
    }

    const admin = createAdminClient();
    const result = await approveJoinRequestAsOwner(admin, requestId, user.id);

    return NextResponse.json({
      message: "Member approved",
      team_id: result.team_id,
    });
  } catch (err) {
    const res = teamAccessToResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "Failed";
    const status =
      msg.includes("not found") || msg.includes("expired") || msg.includes("Request is")
        ? 400
        : msg.includes("Only the team owner")
          ? 403
          : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
