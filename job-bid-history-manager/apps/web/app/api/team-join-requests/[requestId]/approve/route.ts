import { NextResponse } from "next/server";

import { hashJoinApproveToken } from "@/lib/teams/join-token";
import { requireAuthUser, teamAccessToResponse } from "@/lib/teams/access";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";

type Params = { params: Promise<{ requestId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { requestId } = await params;
    const { user } = await requireAuthUser();

    let token = "";
    try {
      const body = (await request.json()) as { token?: string };
      token = (body.token ?? "").trim();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!token) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }

    if (!hasServiceRoleKey()) {
      return NextResponse.json(
        { error: "Server missing SUPABASE_SERVICE_ROLE_KEY" },
        { status: 503 },
      );
    }

    const admin = createAdminClient();
    const { data: joinReq, error: fetchErr } = await admin
      .from("team_join_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();

    if (fetchErr || !joinReq) {
      return NextResponse.json({ error: "Join request not found" }, { status: 404 });
    }

    if (joinReq.owner_user_id !== user.id) {
      return NextResponse.json({ error: "Only the team owner can approve" }, { status: 403 });
    }

    if (joinReq.status !== "pending") {
      return NextResponse.json({ error: `Request is ${joinReq.status}` }, { status: 400 });
    }

    if (new Date(joinReq.expires_at).getTime() < Date.now()) {
      await admin
        .from("team_join_requests")
        .update({ status: "expired" })
        .eq("id", requestId);
      return NextResponse.json({ error: "Join request has expired" }, { status: 400 });
    }

    const tokenHash = hashJoinApproveToken(token);
    if (tokenHash !== joinReq.approve_token_hash) {
      return NextResponse.json({ error: "Invalid approval token" }, { status: 403 });
    }

    const { data: existing } = await admin
      .from("team_members")
      .select("id")
      .eq("team_id", joinReq.team_id)
      .eq("user_id", joinReq.requester_user_id)
      .maybeSingle();

    if (!existing) {
      const { error: memberErr } = await admin.from("team_members").insert({
        team_id: joinReq.team_id,
        user_id: joinReq.requester_user_id,
        role: "member",
      });
      if (memberErr) {
        return NextResponse.json({ error: memberErr.message }, { status: 500 });
      }
    }

    const now = new Date().toISOString();
    const { error: updateErr } = await admin
      .from("team_join_requests")
      .update({ status: "approved", approved_at: now })
      .eq("id", requestId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      message: "Member approved",
      team_id: joinReq.team_id,
    });
  } catch (err) {
    const res = teamAccessToResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "Failed";
    const status = msg.includes("TEAM_JOIN_TOKEN_SECRET") ? 503 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
