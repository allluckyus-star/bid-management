import mammoth from "mammoth";
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

  const { data, error } = await supabase
    .from("resume_files")
    .select("extracted_text, storage_path")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let extracted_text = String(data.extracted_text ?? "").trim();
  if (!extracted_text && data.storage_path) {
    const admin = createAdminClient();
    const { data: blob, error: dlErr } = await admin.storage.from("resumes").download(data.storage_path);
    if (!dlErr && blob) {
      const bytes = Buffer.from(await blob.arrayBuffer());
      const { value } = await mammoth.extractRawText({ buffer: bytes });
      extracted_text = String(value ?? "").trim();
      if (extracted_text) {
        void admin.from("resume_files").update({ extracted_text: extracted_text.slice(0, 500000) }).eq("id", id);
      }
    }
  }

  return NextResponse.json({ extracted_text });
}
