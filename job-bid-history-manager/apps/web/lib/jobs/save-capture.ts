import type { MockExtraction } from "@/lib/extraction/mock-extract";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function saveCapturedJob(
  admin: SupabaseClient,
  opts: {
    userId: string;
    capturedBy: string;
    capturedText: string;
    pageTitle: string;
    sourceUrl: string;
    capturedAt: string;
    extraction: MockExtraction;
    modelName: string;
    promptVersion: string;
  },
): Promise<{ jobId: string }> {
  const now = new Date().toISOString();

  const { data: job, error: jobError } = await admin
    .from("jobs")
    .insert({
      user_id: opts.userId,
      captured_by: opts.capturedBy,
      company_name: opts.extraction.company_name || null,
      job_title: opts.extraction.job_title || null,
      location: opts.extraction.location || null,
      salary_text: opts.extraction.salary_text || null,
      salary_min: opts.extraction.salary_min,
      salary_max: opts.extraction.salary_max,
      salary_currency: opts.extraction.salary_currency,
      salary_period: opts.extraction.salary_period,
      source_url: opts.sourceUrl || null,
      page_title: opts.pageTitle || null,
      captured_at: opts.capturedAt,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (jobError || !job) {
    throw new Error(jobError?.message ?? "Failed to create job");
  }

  const { error: jdError } = await admin.from("job_descriptions").insert({
    job_id: job.id,
    user_id: opts.userId,
    raw_text: opts.capturedText.slice(0, 200000),
    cleaned_text: opts.extraction.cleaned_job_description || null,
    extracted_json: opts.extraction,
    model_name: opts.modelName,
    prompt_version: opts.promptVersion,
    confidence: opts.extraction.confidence,
    extracted_at: now,
  });

  if (jdError) {
    await admin.from("jobs").delete().eq("id", job.id);
    throw new Error(jdError.message);
  }

  return { jobId: job.id };
}
