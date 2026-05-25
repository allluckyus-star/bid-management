import { NextResponse } from "next/server";

import { withTeamRoute } from "@/lib/api/with-team-route";
import { linkResumeToJob } from "@/lib/resumes/storage";
import { requireAuthUser } from "@/lib/teams/access";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id: jobId } = await params;
  return withTeamRoute(request, async () => {
    const { user } = await requireAuthUser();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }

    try {
      const result = await linkResumeToJob(user.id, jobId, file);
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
  return withTeamRoute(request, async () => {
    const supabase = await createClient();
    const { data: resume } = await supabase
      .from("resume_files")
      .select("id, storage_path")
      .eq("job_id", jobId)
      .maybeSingle();

    if (resume) {
      await supabase.storage.from("resumes").remove([resume.storage_path]);
      await supabase.from("resume_files").delete().eq("id", resume.id);
    }

    return new NextResponse(null, { status: 204 });
  });
}
