import { NextResponse } from "next/server";

import { withTeamRoute } from "@/lib/api/with-team-route";
import { createClient } from "@/lib/supabase/server";
import { requireAuthUser } from "@/lib/teams/access";

export async function GET(request: Request) {
  return withTeamRoute(request, async (teamId) => {
    const { supabase } = await requireAuthUser();

    const { data, error } = await supabase
      .from("tags")
      .select("*")
      .eq("team_id", teamId)
      .order("name");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  });
}

export async function POST(request: Request) {
  return withTeamRoute(request, async (teamId) => {
    const { supabase, user } = await requireAuthUser();
    const body = (await request.json()) as { name?: string; color?: string | null };
    const name = (body.name ?? "").trim().toLowerCase();
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

    const { data, error } = await supabase
      .from("tags")
      .insert({
        team_id: teamId,
        user_id: user.id,
        name,
        color: body.color ?? null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  });
}
