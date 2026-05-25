import { NextResponse } from "next/server";

import { withTeamRoute } from "@/lib/api/with-team-route";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";

export async function DELETE(request: Request) {
  return withTeamRoute(request, async (teamId) => {
    if (!hasServiceRoleKey()) {
      return NextResponse.json(
        { error: "Server missing SUPABASE_SERVICE_ROLE_KEY (required for delete)" },
        { status: 503 },
      );
    }

    let job_ids: string[] = [];
    try {
      const body = (await request.json()) as { job_ids?: string[] };
      job_ids = body.job_ids ?? [];
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!job_ids.length) {
      return NextResponse.json({ deleted_count: 0 });
    }

    const now = new Date().toISOString();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("jobs")
      .update({ deleted_at: now, updated_at: now })
      .in("id", job_ids)
      .eq("team_id", teamId)
      .is("deleted_at", null)
      .select("id");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ deleted_count: data?.length ?? 0 });
  });
}
