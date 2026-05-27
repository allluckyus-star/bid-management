import { createHash } from "crypto";
import mammoth from "mammoth";

import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BYTES = 10 * 1024 * 1024;

export type LibraryResumeRow = {
  id: string;
  original_filename: string;
  file_size: number | null;
  is_default: boolean;
  uploaded_at: string;
};

export async function listTeamResumeLibrary(teamId: string): Promise<LibraryResumeRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("team_resume_originals")
    .select("id, original_filename, file_size, is_default, uploaded_at")
    .eq("team_id", teamId)
    .order("uploaded_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as LibraryResumeRow[];
}

export async function uploadTeamResumeOriginal(
  teamId: string,
  userId: string,
  file: File,
  setAsDefault: boolean,
): Promise<LibraryResumeRow> {
  if (!file.name.toLowerCase().endsWith(".docx")) {
    throw new Error("Only .docx files are allowed");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error(`File exceeds max size (${MAX_BYTES} bytes)`);

  const admin = createAdminClient();
  const id = crypto.randomUUID();
  const storagePath = `${teamId}/library/${id}.docx`;

  const { error: upErr } = await admin.storage.from("resumes").upload(storagePath, bytes, {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    upsert: true,
  });
  if (upErr) throw new Error(upErr.message);

  const { value: extracted_text } = await mammoth.extractRawText({ buffer: bytes });
  const now = new Date().toISOString();

  if (setAsDefault) {
    await admin
      .from("team_resume_originals")
      .update({ is_default: false })
      .eq("team_id", teamId)
      .eq("is_default", true);
  }

  const { data, error } = await admin
    .from("team_resume_originals")
    .insert({
      id,
      team_id: teamId,
      user_id: userId,
      original_filename: file.name,
      storage_path: storagePath,
      mime_type: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      file_size: bytes.length,
      extracted_text: extracted_text?.slice(0, 500000) ?? "",
      is_default: setAsDefault,
      uploaded_at: now,
    })
    .select("id, original_filename, file_size, is_default, uploaded_at")
    .single();

  if (error) throw new Error(error.message);
  return data as LibraryResumeRow;
}

export async function setDefaultLibraryResume(teamId: string, resumeId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("team_resume_originals")
    .select("id")
    .eq("id", resumeId)
    .eq("team_id", teamId)
    .maybeSingle();
  if (!row) throw new Error("Resume not found");

  await admin
    .from("team_resume_originals")
    .update({ is_default: false })
    .eq("team_id", teamId);
  const { error } = await admin
    .from("team_resume_originals")
    .update({ is_default: true })
    .eq("id", resumeId)
    .eq("team_id", teamId);
  if (error) throw new Error(error.message);
}

export async function getDefaultLibraryResumeText(teamId: string): Promise<{
  id: string;
  extracted_text: string;
  original_filename: string;
}> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("team_resume_originals")
    .select("id, extracted_text, original_filename")
    .eq("team_id", teamId)
    .eq("is_default", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.extracted_text?.trim()) {
    throw new Error("No default resume in library. Upload one on the Resumes page and set it as default.");
  }
  return {
    id: data.id,
    extracted_text: data.extracted_text,
    original_filename: data.original_filename,
  };
}

export async function deleteLibraryResume(teamId: string, resumeId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("team_resume_originals")
    .select("id, storage_path, is_default")
    .eq("id", resumeId)
    .eq("team_id", teamId)
    .maybeSingle();
  if (!row) throw new Error("Resume not found");
  if (row.is_default) throw new Error("Cannot delete the default resume. Set another default first.");

  await admin.storage.from("resumes").remove([row.storage_path]);
  const { error } = await admin.from("team_resume_originals").delete().eq("id", resumeId);
  if (error) throw new Error(error.message);
}
