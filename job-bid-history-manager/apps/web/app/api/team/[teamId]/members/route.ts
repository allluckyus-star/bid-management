import { NextResponse } from "next/server";

import {
  requireTeamMember,
  requireTeamOwner,
  teamAccessToResponse,
} from "@/lib/teams/access";
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
      .select("name, owner_user_id")
      .eq("id", teamId)
      .single();

    return NextResponse.json({
      team_name: team?.name ?? "",
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

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { teamId } = await params;
    await requireTeamOwner(teamId);
    const body = (await request.json()) as { name?: string };
    const name = (body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("teams")
      .update({ name: name.slice(0, 120) })
      .eq("id", teamId)
      .select("id, name")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ team: data });
  } catch (err) {
    const res = teamAccessToResponse(err);
    if (res) return res;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
