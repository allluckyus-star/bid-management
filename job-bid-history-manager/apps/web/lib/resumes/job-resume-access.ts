import type { SupabaseClient } from "@supabase/supabase-js";

export type JobResumeRow = {
  id: string;
  team_id: string | null;
  job_id: string | null;
  storage_path: string;
  original_filename: string;
  mime_type: string | null;
  extracted_text: string | null;
};

/** Resolve a job-linked resume the caller may access as a member of `teamId`. */
export async function getJobResumeForTeam(
  admin: SupabaseClient,
  resumeId: string,
  teamId: string,
): Promise<JobResumeRow | null> {
  const { data: resume, error } = await admin
    .from("resume_files")
    .select("id, team_id, job_id, storage_path, original_filename, mime_type, extracted_text")
    .eq("id", resumeId)
    .maybeSingle();

  if (error || !resume) return null;

  if (resume.team_id === teamId) {
    return resume as JobResumeRow;
  }

  if (!resume.job_id) return null;

  const { data: job } = await admin
    .from("jobs")
    .select("team_id")
    .eq("id", resume.job_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (job?.team_id !== teamId) return null;

  return resume as JobResumeRow;
}
