import { NextResponse } from "next/server";

import { withTeamRoute } from "@/lib/api/with-team-route";
import { getJobById } from "@/lib/jobs/list-jobs";
import { broadcastTeamDashboardInvalidate } from "@/lib/realtime/broadcast-team-dashboard";
import { requireAuthUser } from "@/lib/teams/access";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  return withTeamRoute(request, async () => {
    const item = await getJobById(id);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(item);
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  return withTeamRoute(request, async (teamId) => {
    if (!hasServiceRoleKey()) {
      return NextResponse.json(
        { error: "Server missing SUPABASE_SERVICE_ROLE_KEY (required for job updates)" },
        { status: 503 },
      );
    }

    const { user } = await requireAuthUser();
    const body = (await request.json()) as Record<string, string | undefined>;
    const admin = createAdminClient();

    const { data: jobRow } = await admin
      .from("jobs")
      .select("id")
      .eq("id", id)
      .eq("team_id", teamId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!jobRow) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updates: Record<string, string | null> = {};
    for (const field of [
      "captured_by",
      "company_name",
      "job_title",
      "location",
      "salary_text",
      "source_url",
    ] as const) {
      if (body[field] !== undefined) updates[field] = body[field] ?? null;
    }

    let changed = false;

    if (Object.keys(updates).length) {
      const { data, error } = await admin
        .from("jobs")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("team_id", teamId)
        .is("deleted_at", null)
        .select("id");

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if ((data?.length ?? 0) > 0) changed = true;
    }

    if (body.notes !== undefined) {
      const { data: existing } = await admin
        .from("notes")
        .select("id")
        .eq("job_id", id)
        .eq("team_id", teamId)
        .maybeSingle();

      if (existing) {
        const { error } = await admin
          .from("notes")
          .update({ body: body.notes ?? "", updated_at: new Date().toISOString() })
          .eq("job_id", id)
          .eq("team_id", teamId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      } else {
        const { error } = await admin.from("notes").insert({
          job_id: id,
          team_id: teamId,
          user_id: user.id,
          body: body.notes ?? "",
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
      changed = true;
    }

    if (changed) {
      void broadcastTeamDashboardInvalidate(teamId, "jobs-patch");
    }

    const item = await getJobById(id);
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(item);
  });
}
