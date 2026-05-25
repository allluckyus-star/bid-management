import { NextResponse } from "next/server";

import { withTeamRoute } from "@/lib/api/with-team-route";
import { deleteTeamTag } from "@/lib/tags/delete-team-tag";
import { teamAccessToResponse } from "@/lib/teams/access";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";
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
    try {
      if (!hasServiceRoleKey()) {
        return NextResponse.json(
          { error: "Server missing SUPABASE_SERVICE_ROLE_KEY (required for tag delete)" },
          { status: 503 },
        );
      }

      const admin = createAdminClient();
      await deleteTeamTag(admin, teamId, id);
      return new NextResponse(null, { status: 204 });
    } catch (err) {
      const res = teamAccessToResponse(err);
      if (res) return res;
      const msg = err instanceof Error ? err.message : "Failed";
      const status = msg === "Tag not found" ? 404 : 500;
      return NextResponse.json({ error: msg }, { status });
    }
  });
}
