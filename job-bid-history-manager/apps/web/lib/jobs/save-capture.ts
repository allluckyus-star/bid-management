import type { JobExtraction } from "@jbhm/shared";
import { attachCaptureTags } from "@/lib/jobs/attach-capture-tags";
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
    extraction: JobExtraction;
    modelName: string;
    promptVersion: string;
  },
): Promise<{ jobId: string }> {
  const now = new Date().toISOString();
  const salary = opts.extraction.salary_text?.trim()
    ? opts.extraction
    : {
        ...opts.extraction,
        salary_text: "",
        salary_min: null,
        salary_max: null,
        salary_period: null,
      };

  const { data: job, error: jobError } = await admin
    .from("jobs")
    .insert({
      user_id: opts.userId,
      captured_by: opts.capturedBy,
      company_name: salary.company_name || null,
      job_title: salary.job_title || null,
      location: salary.location || null,
      salary_text: salary.salary_text || null,
      salary_min: salary.salary_min,
      salary_max: salary.salary_max,
      salary_currency: salary.salary_currency,
      salary_period: salary.salary_period,
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
    cleaned_text: salary.cleaned_job_description || null,
    extracted_json: salary,
    model_name: opts.modelName,
    prompt_version: opts.promptVersion,
    confidence: salary.confidence,
    extracted_at: now,
  });

  if (jdError) {
    await admin.from("jobs").delete().eq("id", job.id);
    throw new Error(jdError.message);
  }

  await attachCaptureTags(admin, {
    userId: opts.userId,
    jobId: job.id,
    tagNames: salary.tag_names,
  });

  return { jobId: job.id };
}
