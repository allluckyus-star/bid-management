import { NextResponse } from "next/server";

import { withTeamRoute } from "@/lib/api/with-team-route";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  return withTeamRoute(request, async (teamId) => {
    const supabase = await createClient();
    const body = (await request.json()) as { name?: string; color?: string | null };
  const updates: Record<string, string | null> = {};
  if (body.name !== undefined) updates.name = body.name.trim().toLowerCase();
  if (body.color !== undefined) updates.color = body.color;

    const { data, error } = await supabase
      .from("tags")
      .update(updates)
      .eq("id", id)
      .eq("team_id", teamId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  });
}

export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  return withTeamRoute(request, async (teamId) => {
    const supabase = await createClient();
    await supabase.from("job_tags").delete().eq("tag_id", id);
    const { error } = await supabase.from("tags").delete().eq("id", id).eq("team_id", teamId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return new NextResponse(null, { status: 204 });
  });
}
