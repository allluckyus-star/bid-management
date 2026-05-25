import { NextResponse } from "next/server";

import { withTeamRoute } from "@/lib/api/with-team-route";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  return withTeamRoute(request, async (teamId) => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("jobs")
      .select("captured_by")
      .eq("team_id", teamId)
      .is("deleted_at", null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const users = [
      ...new Set((data ?? []).map((r) => r.captured_by).filter(Boolean) as string[]),
    ].sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ users });
  });
}
