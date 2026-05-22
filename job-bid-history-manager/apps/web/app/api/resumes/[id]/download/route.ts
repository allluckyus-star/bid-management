import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: row, error } = await supabase
    .from("resume_files")
    .select("storage_path, original_filename, mime_type")
    .eq("id", id)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: blob, error: dlErr } = await admin.storage.from("resumes").download(row.storage_path);
  if (dlErr || !blob) {
    return NextResponse.json({ error: dlErr?.message ?? "Download failed" }, { status: 500 });
  }

  const bytes = await blob.arrayBuffer();
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": row.mime_type ?? "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(row.original_filename)}"`,
    },
  });
}
