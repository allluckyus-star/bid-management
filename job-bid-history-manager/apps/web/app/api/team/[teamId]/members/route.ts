import { NextResponse } from "next/server";

import {
  requireTeamMember,
  requireTeamOwner,
  teamAccessToResponse,
} from "@/lib/teams/access";
import {
  findProfileByEmail,
  insertTeamMember,
  markPendingJoinRequestsApproved,
} from "@/lib/teams/add-member";
import { normalizeTimeZone } from "@/lib/datetime/zoned";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ teamId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { teamId } = await params;
    const membership = await requireTeamMember(teamId);
    const supabase = await createClient();

    const { data: members, error: memErr } = await supabase
      .from("team_members")
      .select("id, user_id, role, joined_at")
      .eq("team_id", teamId)
      .order("joined_at", { ascending: true });

    if (memErr) {
      return NextResponse.json({ error: memErr.message }, { status: 500 });
    }

    const userIds = (members ?? []).map((m) => m.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, display_name")
      .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);

    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    let pending_requests: {
      id: string;
      requester_email: string;
      created_at: string;
    }[] = [];

    if (membership.role === "owner") {
      const { data: pending } = await supabase
        .from("team_join_requests")
        .select("id, requester_email, created_at")
        .eq("team_id", teamId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      pending_requests = (pending ?? []).map((p) => ({
        id: p.id,
        requester_email: p.requester_email,
        created_at: p.created_at,
      }));
    }

    const { data: team } = await supabase
      .from("teams")
      .select("name, owner_user_id, timezone")
      .eq("id", teamId)
      .single();

    return NextResponse.json({
      team_name: team?.name ?? "",
      timezone: normalizeTimeZone(team?.timezone),
      is_owner: membership.role === "owner",
      members: (members ?? []).map((m) => {
        const p = profileById.get(m.user_id);
        return {
          id: m.id,
          user_id: m.user_id,
          role: m.role,
          joined_at: m.joined_at,
          email: p?.email ?? null,
          display_name: p?.display_name ?? null,
        };
      }),
      pending_requests,
    });
  } catch (err) {
    const res = teamAccessToResponse(err);
    if (res) return res;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { teamId } = await params;
    await requireTeamOwner(teamId);

    if (!hasServiceRoleKey()) {
      return NextResponse.json(
        { error: "Server missing SUPABASE_SERVICE_ROLE_KEY" },
        { status: 503 },
      );
    }

    const body = (await request.json()) as { email?: string };
    const email = (body.email ?? "").trim();
    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    const admin = createAdminClient();
    const profile = await findProfileByEmail(admin, email);

    const { data: team } = await admin
      .from("teams")
      .select("owner_user_id")
      .eq("id", teamId)
      .maybeSingle();

    if (team?.owner_user_id === profile.id) {
      return NextResponse.json({ error: "Owner is already on the team" }, { status: 400 });
    }

    await insertTeamMember(admin, teamId, profile.id);
    await markPendingJoinRequestsApproved(admin, teamId, profile.id);

    return NextResponse.json({
      message: "Member added",
      user_id: profile.id,
      email: profile.email,
    });
  } catch (err) {
    const res = teamAccessToResponse(err);
    if (res) return res;
    const msg = err instanceof Error ? err.message : "Failed";
    const status =
      msg.includes("No account found") || msg.includes("Already a team member")
        ? 400
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { teamId } = await params;
    await requireTeamOwner(teamId);
    const body = (await request.json()) as { name?: string; timezone?: string };
    const name = (body.name ?? "").trim();
    const timezoneRaw = body.timezone?.trim();

    if (!name && !timezoneRaw) {
      return NextResponse.json({ error: "name or timezone required" }, { status: 400 });
    }

    const patch: { name?: string; timezone?: string } = {};
    if (name) patch.name = name.slice(0, 120);
    if (timezoneRaw) patch.timezone = normalizeTimeZone(timezoneRaw);

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("teams")
      .update(patch)
      .eq("id", teamId)
      .select("id, name, timezone")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      team: { ...data, timezone: normalizeTimeZone(data.timezone) },
    });
  } catch (err) {
    const res = teamAccessToResponse(err);
    if (res) return res;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
