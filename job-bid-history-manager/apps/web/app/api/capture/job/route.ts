import { resolveUserIdFromBearer } from "@/lib/auth/extension-token";
import { extractJobData } from "@/lib/extraction/extract-job";
import { jsonWithCors, optionsResponse } from "@/lib/http/cors";
import { saveCapturedJob } from "@/lib/jobs/save-capture";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";

const PROMPT_VERSION = "phase4-salary-jd-tags";

type CaptureBody = {
  captured_text?: string;
  source_url?: string;
  page_title?: string;
  captured_at?: string;
  captured_by?: string;
  capture_method?: string;
  extension_version?: string;
};

export async function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function POST(request: Request) {
  if (!hasServiceRoleKey()) {
    return jsonWithCors(
      request,
      { error: "Server missing SUPABASE_SERVICE_ROLE_KEY" },
      503,
    );
  }

  let tokenUser: { userId: string; tokenId: string } | null = null;
  try {
    tokenUser = await resolveUserIdFromBearer(request.headers.get("authorization"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Token configuration error";
    return jsonWithCors(request, { error: msg }, 503);
  }

  if (!tokenUser) {
    return jsonWithCors(request, { error: "Invalid or revoked capture token" }, 401);
  }

  let body: CaptureBody;
  try {
    body = (await request.json()) as CaptureBody;
  } catch {
    return jsonWithCors(request, { error: "Invalid JSON body" }, 400);
  }

  const capturedText = (body.captured_text ?? "").trim();
  if (capturedText.length < 80) {
    return jsonWithCors(
      request,
      { error: "captured_text is required (min ~80 characters of visible text)" },
      400,
    );
  }

  const capturedAt = body.captured_at ?? new Date().toISOString();
  const capturedBy = (body.captured_by ?? "").trim() || "Unknown";
  const pageTitle = (body.page_title ?? "").trim();
  const sourceUrl = (body.source_url ?? "").trim();

  const { extraction, modelName, partial } = await extractJobData(
    capturedText,
    pageTitle,
    sourceUrl,
  );

  const admin = createAdminClient();
  let jobId: string;

  try {
    const saved = await saveCapturedJob(admin, {
      userId: tokenUser.userId,
      capturedBy,
      capturedText,
      pageTitle,
      sourceUrl,
      capturedAt,
      extraction,
      modelName,
      promptVersion: PROMPT_VERSION,
    });
    jobId = saved.jobId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Save failed";
    return jsonWithCors(request, { error: msg }, 500);
  }

  await admin
    .from("extension_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", tokenUser.tokenId);

  return jsonWithCors(request, {
    job_id: jobId,
    message: partial
      ? "Job saved with partial extraction (Groq failed)."
      : "Job captured and indexed successfully.",
    extraction_mode: modelName,
  });
}
