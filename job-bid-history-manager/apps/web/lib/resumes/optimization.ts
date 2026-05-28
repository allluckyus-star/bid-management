import { createHash } from "crypto";
import mammoth from "mammoth";

import { exportOptimizedResumeToDocxBuffer } from "@/lib/resumes/docx-export";
import { buildExportFilename, sanitizeFilenameSegment } from "@/lib/resumes/filename";
import { parseGptResultText } from "@/lib/resumes/gpt-result-parse";
import { getDefaultLibraryResumeText } from "@/lib/resumes/library";
import { buildOptimizationPrompt } from "@/lib/resumes/prompt-template";
import { broadcastTeamDashboardInvalidate } from "@/lib/realtime/broadcast-team-dashboard";
import { createAdminClient } from "@/lib/supabase/admin";

export type CreateOptimizationResult = {
  optimization_id: string;
  prompt_text: string;
};

export async function getLatestCapturedJobId(
  teamId: string,
  userId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("jobs")
    .select("id")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function createResumeOptimization(
  teamId: string,
  userId: string,
  jobId: string,
  libraryResumeId?: string | null,
  customPromptPrefix?: string | null,
): Promise<CreateOptimizationResult> {
  const admin = createAdminClient();

  const { data: job } = await admin
    .from("jobs")
    .select("id, company_name, job_title, team_id")
    .eq("id", jobId)
    .eq("team_id", teamId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!job) throw new Error("Job not found");

  const { data: jd } = await admin
    .from("job_descriptions")
    .select("cleaned_text")
    .eq("job_id", jobId)
    .eq("team_id", teamId)
    .order("extracted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const jdText = String(jd?.cleaned_text ?? "").trim();
  if (!jdText) {
    throw new Error("Job has no cleaned description. Capture the job page first.");
  }

  let resumeId: string;
  let resumeText: string;
  if (libraryResumeId) {
    const { data: lib } = await admin
      .from("team_resume_originals")
      .select("id, extracted_text, original_filename")
      .eq("id", libraryResumeId)
      .eq("team_id", teamId)
      .maybeSingle();
    if (!lib?.extracted_text?.trim()) throw new Error("Selected library resume not found or empty");
    resumeId = lib.id;
    resumeText = lib.extracted_text;
  } else {
    const lib = await getDefaultLibraryResumeText(teamId, userId);
    resumeId = lib.id;
    resumeText = lib.extracted_text;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("display_name, email")
    .eq("id", userId)
    .maybeSingle();
  const userDisplayName =
    String(profile?.display_name ?? "").trim() ||
    String(profile?.email ?? "").split("@")[0] ||
    "Candidate";

  const companyName = String(job.company_name ?? "").trim() || "Company";
  const jobTitle = String(job.job_title ?? "").trim() || "Role";

  const prompt_text = buildOptimizationPrompt({
    jdText,
    resumeText,
    companyName,
    jobTitle,
    userDisplayName,
    customPrefix: customPromptPrefix,
  });

  const { data: row, error } = await admin
    .from("resume_optimizations")
    .insert({
      team_id: teamId,
      job_id: jobId,
      user_id: userId,
      library_resume_id: resumeId,
      status: "pending",
      prompt_text,
      company_name: companyName,
      job_title: jobTitle,
      user_display_name: userDisplayName,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return { optimization_id: row.id, prompt_text };
}

export type GptResultOutcome = {
  export_id: string;
  display_filename: string;
  download_path: string;
  job_id: string;
};

export async function processGptOptimizationResult(
  teamId: string,
  userId: string,
  optimizationId: string,
  gptText: string,
): Promise<GptResultOutcome> {
  const admin = createAdminClient();

  const { data: opt } = await admin
    .from("resume_optimizations")
    .select("*")
    .eq("id", optimizationId)
    .eq("team_id", teamId)
    .maybeSingle();
  if (!opt) throw new Error("Optimization session not found");

  const parsed = parseGptResultText(gptText);
  const docxBuffer = await exportOptimizedResumeToDocxBuffer(parsed.optimized_resume);
  const { value: extractedText } = await mammoth.extractRawText({ buffer: docxBuffer });

  const headerName = String(
    (parsed.optimized_resume.header as { name?: string })?.name ?? opt.user_display_name ?? "",
  ).trim();

  const { data: jobRow } = await admin
    .from("jobs")
    .select("company_name, job_title, page_title")
    .eq("id", opt.job_id)
    .eq("team_id", teamId)
    .maybeSingle();

  const companyName = String(opt.company_name ?? jobRow?.company_name ?? "").trim();
  const jobTitle = String(opt.job_title ?? jobRow?.job_title ?? "").trim();
  const fallbackLabel = String(jobRow?.page_title ?? "").trim() || undefined;

  const display_filename = buildExportFilename({
    userName: headerName || String(opt.user_display_name ?? "Resume"),
    companyName,
    jobTitle,
    fallbackLabel:
      !sanitizeFilenameSegment(companyName) && !sanitizeFilenameSegment(jobTitle)
        ? fallbackLabel
        : undefined,
  });

  const exportId = crypto.randomUUID();
  const storagePath = `${teamId}/exports/${exportId}.docx`;
  const sha256_hash = createHash("sha256").update(docxBuffer).digest("hex");

  const { error: upErr } = await admin.storage.from("resumes").upload(storagePath, docxBuffer, {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    upsert: true,
  });
  if (upErr) throw new Error(upErr.message);

  const now = new Date().toISOString();

  const { error: exportErr } = await admin.from("resume_exports").insert({
    id: exportId,
    team_id: teamId,
    job_id: opt.job_id,
    optimization_id: optimizationId,
    user_id: userId,
    storage_path: storagePath,
    display_filename,
    file_size: docxBuffer.length,
    created_at: now,
  });
  if (exportErr) throw new Error(exportErr.message);

  const { data: existing } = await admin
    .from("resume_files")
    .select("id, storage_path")
    .eq("job_id", opt.job_id);
  for (const row of existing ?? []) {
    await admin.storage.from("resumes").remove([row.storage_path]);
    await admin.from("resume_files").delete().eq("id", row.id);
  }

  const resumeFileId = crypto.randomUUID();
  const { error: linkErr } = await admin.from("resume_files").insert({
    id: resumeFileId,
    team_id: teamId,
    user_id: userId,
    job_id: opt.job_id,
    original_filename: display_filename,
    storage_path: storagePath,
    mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    file_size: docxBuffer.length,
    sha256_hash,
    extracted_text: extractedText?.slice(0, 500000) ?? "",
    uploaded_at: now,
  });
  if (linkErr) throw new Error(linkErr.message);

  await admin
    .from("resume_optimizations")
    .update({
      status: "completed",
      gpt_result_raw: gptText.slice(0, 500000),
      updated_at: now,
      error_message: null,
    })
    .eq("id", optimizationId);

  void broadcastTeamDashboardInvalidate(teamId, "resume-export");

  return {
    export_id: exportId,
    display_filename,
    download_path: `/api/team/${teamId}/resume-exports/${exportId}/download`,
    job_id: opt.job_id,
  };
}
