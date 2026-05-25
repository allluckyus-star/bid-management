import { NextResponse } from "next/server";

import { withTeamRoute } from "@/lib/api/with-team-route";
import { getJobById } from "@/lib/jobs/list-jobs";
import { requireAuthUser } from "@/lib/teams/access";
import { createClient } from "@/lib/supabase/server";

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
    const { supabase, user } = await requireAuthUser();
    const body = (await request.json()) as Record<string, string | undefined>;
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

    if (Object.keys(updates).length) {
      const { error } = await supabase
        .from("jobs")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("team_id", teamId)
        .is("deleted_at", null);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (body.notes !== undefined) {
      const { data: existing } = await supabase
        .from("notes")
        .select("id")
        .eq("job_id", id)
        .maybeSingle();
      if (existing) {
        await supabase
          .from("notes")
          .update({ body: body.notes ?? "", updated_at: new Date().toISOString() })
          .eq("job_id", id);
      } else {
        await supabase.from("notes").insert({
          job_id: id,
          team_id: teamId,
          user_id: user.id,
          body: body.notes ?? "",
        });
      }
    }

    const item = await getJobById(id);
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(item);
  });
}
