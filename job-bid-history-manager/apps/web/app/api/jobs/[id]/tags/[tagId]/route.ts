import { NextResponse } from "next/server";

import { withTeamRoute } from "@/lib/api/with-team-route";
import { broadcastTeamDashboardInvalidate } from "@/lib/realtime/broadcast-team-dashboard";
import { requireAuthUser } from "@/lib/teams/access";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";

type Params = { params: Promise<{ id: string; tagId: string }> };

async function assertJobInTeam(teamId: string, jobId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("jobs")
    .select("id")
    .eq("id", jobId)
    .eq("team_id", teamId)
    .is("deleted_at", null)
    .maybeSingle();
  return !!data;
}

export async function POST(request: Request, { params }: Params) {
  const { id: jobId, tagId } = await params;
  return withTeamRoute(request, async (teamId) => {
    if (!hasServiceRoleKey()) {
      return NextResponse.json({ error: "Server missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });
    }

    const { user } = await requireAuthUser();
    if (!(await assertJobInTeam(teamId, jobId))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const admin = createAdminClient();
    const { error } = await admin.from("job_tags").upsert({
      job_id: jobId,
      tag_id: tagId,
      user_id: user.id,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    void broadcastTeamDashboardInvalidate(teamId, "job-tags");
    return new NextResponse(null, { status: 204 });
  });
}

export async function DELETE(request: Request, { params }: Params) {
  const { id: jobId, tagId } = await params;
  return withTeamRoute(request, async (teamId) => {
    if (!hasServiceRoleKey()) {
      return NextResponse.json({ error: "Server missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });
    }

    if (!(await assertJobInTeam(teamId, jobId))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("job_tags")
      .delete()
      .eq("job_id", jobId)
      .eq("tag_id", tagId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    void broadcastTeamDashboardInvalidate(teamId, "job-tags");
    return new NextResponse(null, { status: 204 });
  });
}
