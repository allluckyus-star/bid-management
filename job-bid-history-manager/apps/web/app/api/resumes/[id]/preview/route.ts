import mammoth from "mammoth";
import { NextResponse } from "next/server";

import { withTeamRoute } from "@/lib/api/with-team-route";
import { getJobResumeForTeam } from "@/lib/resumes/job-resume-access";
import { createAdminClient } from "@/lib/supabase/admin";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  return withTeamRoute(request, async (teamId) => {
    const admin = createAdminClient();
    const data = await getJobResumeForTeam(admin, id, teamId);
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let extracted_text = String(data.extracted_text ?? "").trim();
    if (!extracted_text && data.storage_path) {
      const { data: blob, error: dlErr } = await admin.storage
        .from("resumes")
        .download(data.storage_path);
      if (!dlErr && blob) {
        const bytes = Buffer.from(await blob.arrayBuffer());
        const { value } = await mammoth.extractRawText({ buffer: bytes });
        extracted_text = String(value ?? "").trim();
        if (extracted_text) {
          void admin
            .from("resume_files")
            .update({ extracted_text: extracted_text.slice(0, 500000) })
            .eq("id", id);
        }
      }
    }

    return NextResponse.json({ extracted_text });
  });
}
