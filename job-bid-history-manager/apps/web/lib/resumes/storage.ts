import { createHash } from "crypto";
import mammoth from "mammoth";

import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BYTES = 10 * 1024 * 1024;

export async function linkResumeToJob(
  userId: string,
  jobId: string,
  file: File,
): Promise<{ id: string; original_filename: string; file_size: number; linked_at: string }> {
  if (!file.name.toLowerCase().endsWith(".docx")) {
    throw new Error("Only .docx files are allowed");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > MAX_BYTES) {
    throw new Error(`File exceeds max size (${MAX_BYTES} bytes)`);
  }

  const admin = createAdminClient();
  const { data: job } = await admin.from("jobs").select("id").eq("id", jobId).is("deleted_at", null).maybeSingle();
  if (!job) throw new Error("Job not found");

  const { data: existing } = await admin.from("resume_files").select("id, storage_path").eq("job_id", jobId);
  for (const row of existing ?? []) {
    await admin.storage.from("resumes").remove([row.storage_path]);
    await admin.from("resume_files").delete().eq("id", row.id);
  }

  const resumeId = crypto.randomUUID();
  const storagePath = `${userId}/${resumeId}.docx`;
  const sha256_hash = createHash("sha256").update(bytes).digest("hex");

  const { error: upErr } = await admin.storage.from("resumes").upload(storagePath, bytes, {
    contentType: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    upsert: true,
  });
  if (upErr) throw new Error(upErr.message);

  const { value: extracted_text } = await mammoth.extractRawText({ buffer: bytes });
  const now = new Date().toISOString();

  const { error: insErr } = await admin.from("resume_files").insert({
    id: resumeId,
    user_id: userId,
    job_id: jobId,
    original_filename: file.name,
    storage_path: storagePath,
    mime_type: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    file_size: bytes.length,
    sha256_hash,
    extracted_text: extracted_text?.slice(0, 500000) ?? "",
    uploaded_at: now,
  });

  if (insErr) throw new Error(insErr.message);

  return {
    id: resumeId,
    original_filename: file.name,
    file_size: bytes.length,
    linked_at: now,
  };
}
