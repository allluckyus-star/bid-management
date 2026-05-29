import { resolveUserIdFromBearer } from "@/lib/auth/extension-token";
import { resolveValidatedUsernameForToken } from "@/lib/auth/username";
import {
  buildReviewedExtraction,
  validateReviewedFieldLengths,
  type ReviewedCaptureFields,
} from "@/lib/capture/reviewed-extraction";
import { extractJobData } from "@/lib/extraction/extract-job";
import { mockExtractJobData } from "@/lib/extraction/mock-extract";
import { jsonWithCors, optionsResponse } from "@/lib/http/cors";
import { logRouteTiming } from "@/lib/http/log-route-timing";
import { saveCapturedJob } from "@/lib/jobs/save-capture";
import { broadcastTeamDashboardInvalidate } from "@/lib/realtime/broadcast-team-dashboard";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";

const ROUTE = "/api/capture/job";
const PROMPT_VERSION = "phase4-salary-jd-tags";
const MAX_CAPTURE_TEXT_CHARS = 30_000;
const DUPLICATE_CAPTURE_WINDOW_MS = 30_000;

type CaptureBody = ReviewedCaptureFields & {
  captured_text?: string;
  source_url?: string;
  page_title?: string;
  captured_at?: string;
  username?: string;
  capture_method?: string;
  extension_version?: string;
  extraction_source?: string;
  resume_path?: string;
  notes?: string;
};

function syncCaptureExtractionEnabled(): boolean {
  return process.env.SYNC_CAPTURE_EXTRACTION === "true";
}

function realtimeInvalidationEnabled(): boolean {
  return process.env.ENABLE_REALTIME_INVALIDATION === "true";
}

export async function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function POST(request: Request) {
  const routeStart = Date.now();
  logRouteTiming(ROUTE, "start", routeStart, { captureSource: "api" });

  if (!hasServiceRoleKey()) {
    logRouteTiming(ROUTE, "done", routeStart, { success: false, failure: "no_service_role" });
    return jsonWithCors(
      request,
      { error: "Server missing SUPABASE_SERVICE_ROLE_KEY" },
      503,
    );
  }

  let tokenUser: { userId: string; tokenId: string; teamId: string } | null = null;
  const tokenStep = Date.now();
  try {
    tokenUser = await resolveUserIdFromBearer(request.headers.get("authorization"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Token configuration error";
    logRouteTiming(ROUTE, "token_validated", tokenStep, { success: false, failure: msg });
    logRouteTiming(ROUTE, "done", routeStart, { success: false });
    return jsonWithCors(request, { error: msg }, 503);
  }

  if (!tokenUser) {
    logRouteTiming(ROUTE, "token_validated", tokenStep, { success: false, failure: "invalid_token" });
    logRouteTiming(ROUTE, "done", routeStart, { success: false });
    return jsonWithCors(request, { error: "Invalid or revoked capture token" }, 401);
  }
  logRouteTiming(ROUTE, "token_validated", tokenStep, { success: true });

  let body: CaptureBody;
  const bodyStep = Date.now();
  try {
    body = (await request.json()) as CaptureBody;
  } catch {
    logRouteTiming(ROUTE, "body_parsed", bodyStep, { success: false });
    logRouteTiming(ROUTE, "done", routeStart, { success: false });
    return jsonWithCors(request, { error: "Invalid JSON body" }, 400);
  }
  logRouteTiming(ROUTE, "body_parsed", bodyStep, {
    success: true,
    extractionSource: body.extraction_source || body.capture_method || "unknown",
  });

  const capturedText = (body.captured_text ?? "").trim().slice(0, MAX_CAPTURE_TEXT_CHARS);
  const textLength = capturedText.length;
  if (textLength < 80) {
    logRouteTiming(ROUTE, "done", routeStart, {
      success: false,
      textLength,
      failure: "text_too_short",
    });
    return jsonWithCors(
      request,
      { error: "captured_text is required (min ~80 characters of visible text)" },
      400,
    );
  }

  const fieldError = validateReviewedFieldLengths(body);
  if (fieldError) {
    return jsonWithCors(request, { error: fieldError }, 400);
  }

  const capturedAt = body.captured_at ?? new Date().toISOString();
  const pageTitle = (body.page_title ?? "").trim();
  const sourceUrl = (body.source_url ?? "").trim();

  const admin = createAdminClient();

  const usernameStep = Date.now();
  const identity = await resolveValidatedUsernameForToken(
    admin,
    tokenUser.userId,
    body.username ?? "",
  );
  if (!identity.ok) {
    const error =
      identity.status === 400
        ? "Username is required. Register your username in the web dashboard and add it in extension settings."
        : identity.error;
    logRouteTiming(ROUTE, "username_validated", usernameStep, {
      success: false,
      failure: "username_invalid",
    });
    logRouteTiming(ROUTE, "done", routeStart, { success: false, textLength });
    return jsonWithCors(request, { error }, identity.status);
  }
  const capturedBy = identity.username;
  logRouteTiming(ROUTE, "username_validated", usernameStep, { success: true });

  if (sourceUrl) {
    const dupStep = Date.now();
    const since = new Date(Date.now() - DUPLICATE_CAPTURE_WINDOW_MS).toISOString();
    const { data: recent } = await admin
      .from("jobs")
      .select("id")
      .eq("team_id", tokenUser.teamId)
      .eq("source_url", sourceUrl)
      .gte("created_at", since)
      .limit(1)
      .maybeSingle();

    if (recent?.id) {
      logRouteTiming(ROUTE, "duplicate_check", dupStep, {
        success: true,
        duplicate: true,
        textLength,
      });
      logRouteTiming(ROUTE, "done", routeStart, { success: true, duplicate: true, textLength });
      return jsonWithCors(
        request,
        {
          job_id: recent.id,
          message: "Job already captured for this URL recently.",
          extraction_mode: "duplicate-skipped",
          ai_extraction: false,
        },
        200,
      );
    }
    logRouteTiming(ROUTE, "duplicate_check", dupStep, { success: true, duplicate: false });
  }

  const clientReviewed = body.client_reviewed === true;
  const syncAi = syncCaptureExtractionEnabled() && !clientReviewed;
  let extractionMode: string;
  const extractStep = Date.now();
  let extraction;
  let modelName: string;
  let partial = false;
  let aiExtraction = false;

  if (clientReviewed) {
    extraction = buildReviewedExtraction(body, capturedText, pageTitle, sourceUrl);
    modelName = "client-reviewed";
    extractionMode = "client-reviewed";
    aiExtraction = false;
  } else if (syncAi) {
    const outcome = await extractJobData(capturedText, pageTitle, sourceUrl);
    extraction = outcome.extraction;
    modelName = outcome.modelName;
    partial = outcome.partial;
    extractionMode = "sync-ai";
    aiExtraction = true;
  } else {
    extraction = mockExtractJobData(capturedText, pageTitle, sourceUrl);
    modelName = "fast-heuristic";
    extractionMode = "fast-heuristic";
    aiExtraction = false;
  }
  logRouteTiming(ROUTE, "extraction_done", extractStep, {
    success: true,
    extractionMode,
    textLength,
    partial,
    aiExtraction,
  });

  let jobId: string;
  const saveStep = Date.now();
  try {
    const saved = await saveCapturedJob(admin, {
      teamId: tokenUser.teamId,
      userId: tokenUser.userId,
      capturedBy,
      capturedText,
      pageTitle,
      sourceUrl,
      capturedAt,
      extraction,
      modelName,
      promptVersion: PROMPT_VERSION,
      resumePath: body.resume_path,
      notes: body.notes,
    });
    jobId = saved.jobId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Save failed";
    logRouteTiming(ROUTE, "save_done", saveStep, { success: false, extractionMode, textLength });
    logRouteTiming(ROUTE, "done", routeStart, { success: false, extractionMode, textLength });
    return jsonWithCors(request, { error: msg }, 500);
  }
  logRouteTiming(ROUTE, "save_done", saveStep, { success: true, extractionMode, textLength });

  const tokenUpdateStep = Date.now();
  await admin
    .from("extension_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", tokenUser.tokenId);
  logRouteTiming(ROUTE, "token_last_used_updated", tokenUpdateStep, { success: true });

  if (realtimeInvalidationEnabled()) {
    const rtStep = Date.now();
    void broadcastTeamDashboardInvalidate(tokenUser.teamId, "capture");
    logRouteTiming(ROUTE, "realtime_invalidation", rtStep, { success: true, skipped: false });
  } else {
    logRouteTiming(ROUTE, "realtime_skipped", routeStart, { success: true, skipped: true });
  }

  const message = clientReviewed
    ? "Job captured with reviewed fields. AI extraction was not run."
    : syncAi
      ? partial
        ? "Job saved with partial extraction (Groq failed)."
        : "Job captured and indexed successfully."
      : "Job captured. AI extraction runs only when SYNC_CAPTURE_EXTRACTION=true.";

  logRouteTiming(ROUTE, "done", routeStart, {
    success: true,
    extractionMode,
    textLength,
    aiExtraction,
  });

  return jsonWithCors(request, {
    job_id: jobId,
    message,
    extraction_mode: modelName,
    ai_extraction: aiExtraction,
  });
}
