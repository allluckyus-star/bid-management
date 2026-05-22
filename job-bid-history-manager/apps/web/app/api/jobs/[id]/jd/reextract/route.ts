import { NextResponse } from "next/server";

import { extractJobData } from "@/lib/extraction/extract-job";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const PROMPT_VERSION = "phase3-groq-innertext";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id: jobId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("id, page_title, source_url, captured_by")
    .eq("id", jobId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const { data: jd } = await supabase
    .from("job_descriptions")
    .select("raw_text")
    .eq("job_id", jobId)
    .order("extracted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!jd?.raw_text) {
    return NextResponse.json({ error: "No raw JD text" }, { status: 404 });
  }

  const { extraction, modelName } = await extractJobData(
    jd.raw_text,
    job.page_title ?? "",
    job.source_url ?? "",
  );

  const admin = createAdminClient();
  const now = new Date().toISOString();

  await admin
    .from("jobs")
    .update({
      company_name: extraction.company_name || null,
      job_title: extraction.job_title || null,
      location: extraction.location || null,
      salary_text: extraction.salary_text || null,
      salary_min: extraction.salary_min,
      salary_max: extraction.salary_max,
      salary_currency: extraction.salary_currency,
      salary_period: extraction.salary_period,
      updated_at: now,
    })
    .eq("id", jobId);

  await admin.from("job_descriptions").insert({
    job_id: jobId,
    user_id: user.id,
    raw_text: jd.raw_text,
    cleaned_text: extraction.cleaned_job_description || null,
    extracted_json: extraction,
    model_name: modelName,
    prompt_version: PROMPT_VERSION,
    confidence: extraction.confidence,
    extracted_at: now,
  });

  return NextResponse.json({
    jd: {
      cleaned_text: extraction.cleaned_job_description,
      model_name: modelName,
      extracted_at: now,
    },
    job_fields: extraction,
  });
}
