import { NextResponse } from "next/server";

import { withTeamRoute } from "@/lib/api/with-team-route";
import { linkResumeToJob } from "@/lib/resumes/storage";
import { broadcastTeamDashboardInvalidate } from "@/lib/realtime/broadcast-team-dashboard";
import { requireAuthUser } from "@/lib/teams/access";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id: jobId } = await params;
  return withTeamRoute(request, async (teamId) => {
    const { user } = await requireAuthUser();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }

    try {
      const result = await linkResumeToJob(user.id, jobId, file);
      void broadcastTeamDashboardInvalidate(teamId, "resume-upload");
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Upload failed" },
        { status: 400 },
      );
    }
  });
}

export async function DELETE(request: Request, { params }: Params) {
  const { id: jobId } = await params;
  return withTeamRoute(request, async (teamId) => {
    if (!hasServiceRoleKey()) {
      return NextResponse.json({ error: "Server missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 503 });
    }

    const admin = createAdminClient();
    const { data: resume } = await admin
      .from("resume_files")
      .select("id, storage_path")
      .eq("job_id", jobId)
      .eq("team_id", teamId)
      .maybeSingle();

    if (resume) {
      await admin.storage.from("resumes").remove([resume.storage_path]);
      await admin.from("resume_files").delete().eq("id", resume.id);
      void broadcastTeamDashboardInvalidate(teamId, "resume-unlink");
    }

    return new NextResponse(null, { status: 204 });
  });
}
