import { resolveUserIdFromBearer } from "@/lib/auth/extension-token";
import { groqExtractJobData } from "@/lib/extraction/groq";
import { jsonWithCors, optionsResponse } from "@/lib/http/cors";
import { logRouteTiming } from "@/lib/http/log-route-timing";

const ROUTE = "/api/extension/extract";
const MAX_CAPTURE_TEXT_CHARS = 30_000;

type ExtractBody = {
  captured_text?: string;
  page_title?: string;
  source_url?: string;
};

export async function OPTIONS(request: Request) {
  return optionsResponse(request);
}

/**
 * AI extraction only — runs Groq on supplied text and returns structured fields.
 * Does NOT persist anything. The extension fills its Preview tab from this and
 * only saves later via /api/capture/job after the user accepts.
 */
export async function POST(request: Request) {
  const routeStart = Date.now();
  logRouteTiming(ROUTE, "start", routeStart);

  const tokenStep = Date.now();
  let tokenUser: { userId: string; tokenId: string; teamId: string } | null = null;
  try {
    tokenUser = await resolveUserIdFromBearer(request.headers.get("authorization"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Token configuration error";
    logRouteTiming(ROUTE, "done", routeStart, { success: false });
    return jsonWithCors(request, { error: msg }, 503);
  }
  if (!tokenUser) {
    logRouteTiming(ROUTE, "done", routeStart, { success: false });
    return jsonWithCors(request, { error: "Invalid or revoked capture token" }, 401);
  }
  logRouteTiming(ROUTE, "token_validated", tokenStep, { success: true });

  let body: ExtractBody;
  try {
    body = (await request.json()) as ExtractBody;
  } catch {
    return jsonWithCors(request, { error: "Invalid JSON body" }, 400);
  }

  const capturedText = (body.captured_text ?? "").trim().slice(0, MAX_CAPTURE_TEXT_CHARS);
  if (capturedText.length < 40) {
    return jsonWithCors(
      request,
      { error: "Not enough text to extract (need ~40+ characters)." },
      400,
    );
  }

  const pageTitle = (body.page_title ?? "").trim();
  const sourceUrl = (body.source_url ?? "").trim();

  const extractStep = Date.now();
  try {
    const { result, modelLabel } = await groqExtractJobData(capturedText, pageTitle, sourceUrl);
    logRouteTiming(ROUTE, "extraction_done", extractStep, {
      success: true,
      textLength: capturedText.length,
    });
    logRouteTiming(ROUTE, "done", routeStart, { success: true });
    return jsonWithCors(request, {
      ok: true,
      model: modelLabel,
      extraction: result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Extraction failed";
    logRouteTiming(ROUTE, "done", routeStart, { success: false });
    const status = /GROQ_API_KEY/.test(msg) ? 503 : 502;
    return jsonWithCors(request, { error: msg }, status);
  }
}
