import { NextResponse } from "next/server";

import { requireTeamOwner, teamAccessToResponse } from "@/lib/teams/access";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ teamId: string; userId: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { teamId, userId } = await params;
    const owner = await requireTeamOwner(teamId);

    if (userId === owner.userId) {
      return NextResponse.json({ error: "Cannot remove team owner" }, { status: 400 });
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("team_members")
      .delete()
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .neq("role", "owner");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = teamAccessToResponse(err);
    if (res) return res;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
