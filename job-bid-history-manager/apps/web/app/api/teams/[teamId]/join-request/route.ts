import { NextResponse } from "next/server";

import { sendTeamJoinRequestEmail } from "@/lib/email/team-join";
import { requireAuthUser, teamAccessToResponse } from "@/lib/teams/access";
import {
  generateJoinApproveToken,
  hashJoinApproveToken,
  joinApproveExpiresAt,
} from "@/lib/teams/join-token";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ teamId: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const { teamId } = await params;
    const { user } = await requireAuthUser();
    const supabase = await createClient();

    const { data: existingMember } = await supabase
      .from("team_members")
      .select("id")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingMember) {
      return NextResponse.json({ error: "Already a team member" }, { status: 400 });
    }

    const { data: team, error: teamErr } = await supabase
      .from("teams")
      .select("id, name, owner_user_id, owner_email")
      .eq("id", teamId)
      .maybeSingle();

    if (teamErr || !team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    if (team.owner_user_id === user.id) {
      return NextResponse.json({ error: "You own this team" }, { status: 400 });
    }

    const { data: pending } = await supabase
      .from("team_join_requests")
      .select("id")
      .eq("team_id", teamId)
      .eq("requester_user_id", user.id)
      .eq("status", "pending")
      .maybeSingle();

    if (pending) {
      return NextResponse.json({ message: "Join request already pending" });
    }

    if (!hasServiceRoleKey()) {
      return NextResponse.json(
        { error: "Server missing SUPABASE_SERVICE_ROLE_KEY" },
        { status: 503 },
      );
    }

    const rawToken = generateJoinApproveToken();
    const approveTokenHash = hashJoinApproveToken(rawToken);
    const requesterEmail = user.email ?? "";
    const ownerEmail = team.owner_email ?? "";

    const admin = createAdminClient();
    const { data: reqRow, error: insertErr } = await admin
      .from("team_join_requests")
      .insert({
        team_id: teamId,
        requester_user_id: user.id,
        requester_email: requesterEmail,
        owner_user_id: team.owner_user_id,
        owner_email: ownerEmail,
        status: "pending",
        approve_token_hash: approveTokenHash,
        expires_at: joinApproveExpiresAt(48),
      })
      .select("id")
      .single();

    if (insertErr || !reqRow) {
      return NextResponse.json({ error: insertErr?.message ?? "Insert failed" }, { status: 500 });
    }

    try {
      await sendTeamJoinRequestEmail({
        ownerEmail,
        requesterEmail,
        teamName: team.name,
        requestId: reqRow.id,
        approveToken: rawToken,
      });
    } catch (emailErr) {
      const msg = emailErr instanceof Error ? emailErr.message : "Email failed";
      return NextResponse.json(
        { error: `Join request saved but email failed: ${msg}` },
        { status: 502 },
      );
    }

    return NextResponse.json({ message: "Join request sent to team owner" });
  } catch (err) {
    const res = teamAccessToResponse(err);
    if (res) return res;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
