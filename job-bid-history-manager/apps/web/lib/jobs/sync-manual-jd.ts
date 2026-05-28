import type { JobExtraction } from "@jbhm/shared";

import { resolveCapturedByForUser } from "@/lib/auth/extension-identity";
import { extractJobData } from "@/lib/extraction/extract-job";
import { attachCaptureTags } from "@/lib/jobs/attach-capture-tags";
import { broadcastTeamDashboardInvalidate } from "@/lib/realtime/broadcast-team-dashboard";
import { createAdminClient } from "@/lib/supabase/admin";

const PROMPT_VERSION = "manual-jd-sync";
const MIN_JD_CHARS = 40;

export type ManualJdSyncOrigin = "page_selection" | "extension" | "dashboard" | "upload";

export function resolveManualJdSourceUrl(
  origin: ManualJdSyncOrigin,
  opts: { pageUrl?: string | null; localFilePath?: string | null },
): string | null {
  if (origin === "page_selection") {
    const url = String(opts.pageUrl ?? "").trim();
    return url || null;
  }
  if (origin === "upload") {
    const path = String(opts.localFilePath ?? "").trim();
    return path || null;
  }
  return "-";
}

function applyManualTitleFallbacks(
  extraction: JobExtraction,
  manualTitle: string,
): JobExtraction {
  const title = String(manualTitle ?? "").trim();
  if (!title || title === "manual-jd" || title === "manual jd") {
    return extraction;
  }
  const company = String(extraction.company_name ?? "").trim();
  const jobTitle = String(extraction.job_title ?? "").trim();
  if (!company && !jobTitle) {
    return {
      ...extraction,
      job_title: title.slice(0, 200),
    };
  }
  if (!jobTitle) {
    return { ...extraction, job_title: title.slice(0, 200) };
  }
  if (!company) {
    return { ...extraction, company_name: title.slice(0, 120) };
  }
  return extraction;
}

export async function syncManualJdToBidHistory(input: {
  teamId: string;
  userId: string;
  manualInputId: string;
  jdText: string;
  manualTitle: string;
  origin: ManualJdSyncOrigin;
  pageUrl?: string | null;
  localFilePath?: string | null;
  capturedBy?: string | null;
}): Promise<{ jobId: string | null; skipped?: boolean }> {
  const jdText = String(input.jdText ?? "").trim();
  if (jdText.length < MIN_JD_CHARS) {
    return { jobId: null, skipped: true };
  }

  const admin = createAdminClient();
  const capturedBy =
    String(input.capturedBy ?? "").trim() ||
    (await resolveCapturedByForUser(admin, input.userId));
  const sourceUrl = resolveManualJdSourceUrl(input.origin, {
    pageUrl: input.pageUrl,
    localFilePath: input.localFilePath,
  });
  const pageTitle = String(input.manualTitle ?? "").trim() || "Manual JD";
  const capturedAt = new Date().toISOString();

  const { extraction, modelName } = await extractJobData(jdText, pageTitle, sourceUrl ?? "");
  const enriched = applyManualTitleFallbacks(extraction, input.manualTitle);

  const salary = enriched.salary_text?.trim()
    ? enriched
    : {
        ...enriched,
        salary_text: "",
        salary_min: null,
        salary_max: null,
        salary_period: null,
      };

  const { data: manualRow } = await admin
    .from("team_jd_manual_inputs")
    .select("job_id")
    .eq("id", input.manualInputId)
    .eq("team_id", input.teamId)
    .maybeSingle();

  let jobId = manualRow?.job_id ?? null;

  const jobPayload = {
    company_name: salary.company_name || null,
    job_title: salary.job_title || null,
    location: salary.location || null,
    salary_text: salary.salary_text || null,
    salary_min: salary.salary_min,
    salary_max: salary.salary_max,
    salary_currency: salary.salary_currency,
    salary_period: salary.salary_period,
    source_url: sourceUrl,
    page_title: pageTitle,
    captured_at: capturedAt,
    captured_by: capturedBy,
    updated_at: capturedAt,
  };

  if (jobId) {
    const { error: jobErr } = await admin
      .from("jobs")
      .update(jobPayload)
      .eq("id", jobId)
      .eq("team_id", input.teamId);
    if (jobErr) throw new Error(jobErr.message);
  } else {
    const { data: job, error: jobErr } = await admin
      .from("jobs")
      .insert({
        team_id: input.teamId,
        user_id: input.userId,
        ...jobPayload,
        created_at: capturedAt,
      })
      .select("id")
      .single();
    if (jobErr || !job) throw new Error(jobErr?.message ?? "Failed to create manual JD job");
    jobId = job.id;
  }

  const { error: jdErr } = await admin.from("job_descriptions").insert({
    job_id: jobId,
    team_id: input.teamId,
    user_id: input.userId,
    raw_text: jdText.slice(0, 200000),
    cleaned_text: salary.cleaned_job_description || jdText.slice(0, 200000),
    extracted_json: salary,
    model_name: modelName,
    prompt_version: PROMPT_VERSION,
    confidence: salary.confidence,
    extracted_at: capturedAt,
  });
  if (jdErr) throw new Error(jdErr.message);

  await attachCaptureTags(admin, {
    teamId: input.teamId,
    userId: input.userId,
    jobId,
    tagNames: salary.tag_names,
  });

  const { error: linkErr } = await admin
    .from("team_jd_manual_inputs")
    .update({ job_id: jobId, source_url: sourceUrl })
    .eq("id", input.manualInputId)
    .eq("team_id", input.teamId);
  if (linkErr) throw new Error(linkErr.message);

  void broadcastTeamDashboardInvalidate(input.teamId, "manual-jd");

  return { jobId };
}
