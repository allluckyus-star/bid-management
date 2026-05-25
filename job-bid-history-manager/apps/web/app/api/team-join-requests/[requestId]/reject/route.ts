import { NextResponse } from "next/server";

import { requireAuthUser, teamAccessToResponse } from "@/lib/teams/access";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";

type Params = { params: Promise<{ requestId: string }> };

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
    const { data: joinReq, error: fetchErr } = await admin
      .from("team_join_requests")
      .select("id, owner_user_id, status")
      .eq("id", requestId)
      .maybeSingle();

    if (fetchErr || !joinReq) {
      return NextResponse.json({ error: "Join request not found" }, { status: 404 });
    }

    if (joinReq.owner_user_id !== user.id) {
      return NextResponse.json({ error: "Only the team owner can reject" }, { status: 403 });
    }

    if (joinReq.status !== "pending") {
      return NextResponse.json({ error: `Request is ${joinReq.status}` }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { error: updateErr } = await admin
      .from("team_join_requests")
      .update({ status: "rejected", rejected_at: now })
      .eq("id", requestId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ message: "Join request rejected" });
  } catch (err) {
    const res = teamAccessToResponse(err);
    if (res) return res;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
