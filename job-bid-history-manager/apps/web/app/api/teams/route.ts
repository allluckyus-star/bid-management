import { NextResponse } from "next/server";

import {
  requireAuthUser,
  teamAccessToResponse,
} from "@/lib/teams/access";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const { supabase, user } = await requireAuthUser();

    const { data: memberships, error: memErr } = await supabase
      .from("team_members")
      .select("team_id, role")
      .eq("user_id", user.id);

    if (memErr) {
      return NextResponse.json({ error: memErr.message }, { status: 500 });
    }

    const memberTeamIds = new Set((memberships ?? []).map((m) => m.team_id));
    const roleByTeam = new Map(
      (memberships ?? []).map((m) => [m.team_id, m.role as "owner" | "member"]),
    );

    const { data: teams, error: teamsErr } = await supabase
      .from("teams")
      .select("id, name, owner_email, owner_user_id, created_at")
      .order("name");

    if (teamsErr) {
      return NextResponse.json({ error: teamsErr.message }, { status: 500 });
    }

    const { data: pending } = await supabase
      .from("team_join_requests")
      .select("team_id")
      .eq("requester_user_id", user.id)
      .eq("status", "pending");

    const pendingTeamIds = new Set((pending ?? []).map((p) => p.team_id));

    const my_teams = (teams ?? [])
      .filter((t) => memberTeamIds.has(t.id))
      .map((t) => ({
        id: t.id,
        name: t.name,
        owner_email: t.owner_email,
        role: roleByTeam.get(t.id) ?? "member",
        is_owner: roleByTeam.get(t.id) === "owner",
      }));

    const other_teams = (teams ?? [])
      .filter((t) => !memberTeamIds.has(t.id))
      .map((t) => ({
        id: t.id,
        name: t.name,
        owner_email: t.owner_email,
        join_status: pendingTeamIds.has(t.id) ? ("pending" as const) : ("none" as const),
      }));

    return NextResponse.json({ my_teams, other_teams });
  } catch (err) {
    const res = teamAccessToResponse(err);
    if (res) return res;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireAuthUser();
    const body = (await request.json()) as { name?: string };
    const name = (body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Team name is required" }, { status: 400 });
    }

    const ownerEmail = user.email ?? "";
    const { data: team, error: teamErr } = await supabase
      .from("teams")
      .insert({
        name: name.slice(0, 120),
        owner_user_id: user.id,
        owner_email: ownerEmail,
      })
      .select("id, name, owner_email")
      .single();

    if (teamErr || !team) {
      return NextResponse.json({ error: teamErr?.message ?? "Create failed" }, { status: 500 });
    }

    const { error: memberErr } = await supabase.from("team_members").insert({
      team_id: team.id,
      user_id: user.id,
      role: "owner",
    });

    if (memberErr) {
      return NextResponse.json({ error: memberErr.message }, { status: 500 });
    }

    return NextResponse.json({ team });
  } catch (err) {
    const res = teamAccessToResponse(err);
    if (res) return res;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
