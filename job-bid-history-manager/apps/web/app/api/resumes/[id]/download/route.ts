import { NextResponse } from "next/server";

import { withTeamRoute } from "@/lib/api/with-team-route";
import { getJobResumeForTeam } from "@/lib/resumes/job-resume-access";
import { createAdminClient } from "@/lib/supabase/admin";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  return withTeamRoute(request, async (teamId) => {
    const admin = createAdminClient();
    const row = await getJobResumeForTeam(admin, id, teamId);
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: blob, error: dlErr } = await admin.storage
      .from("resumes")
      .download(row.storage_path);
    if (dlErr || !blob) {
      return NextResponse.json(
        { error: dlErr?.message ?? "Download failed" },
        { status: 500 },
      );
    }

    const bytes = await blob.arrayBuffer();
    return new NextResponse(bytes, {
      headers: {
        "Content-Type":
          row.mime_type ??
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(row.original_filename)}"`,
      },
    });
  });
}
