import { corsHeaders, jsonWithCors, optionsResponse } from "@/lib/http/cors";
import { logRouteTiming } from "@/lib/http/log-route-timing";
import { exportOptimizedResumeToDocxBuffer, normalizeDocxStyleId } from "@/lib/resumes/docx-export";
import { buildExportFilename } from "@/lib/resumes/filename";
import { parseGptResultText } from "@/lib/resumes/gpt-result-parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/extension/render-docx";

export async function OPTIONS(request: Request) {
  return optionsResponse(request);
}

/**
 * Stateless DOCX render — no capture token required.
 * Extension uses this for local Downloads when the user has not configured dashboard sync.
 */
export async function POST(request: Request) {
  const routeStart = Date.now();
  logRouteTiming(ROUTE, "start", routeStart);

  let body: { text?: string; jd_label?: string; docx_style?: string };
  try {
    body = (await request.json()) as { text?: string; jd_label?: string; docx_style?: string };
  } catch {
    logRouteTiming(ROUTE, "done", routeStart, { success: false });
    return jsonWithCors(request, { error: "Invalid JSON body" }, 400);
  }

  const text = String(body.text ?? "").trim();
  if (!text) {
    logRouteTiming(ROUTE, "done", routeStart, { success: false });
    return jsonWithCors(request, { error: "text is required" }, 400);
  }

  try {
    const parsed = parseGptResultText(text);
    const docxStyle = normalizeDocxStyleId(body.docx_style);
    const docxBuffer = await exportOptimizedResumeToDocxBuffer(parsed.optimized_resume, docxStyle);
    if (docxBuffer.length < 4 || docxBuffer[0] !== 0x50 || docxBuffer[1] !== 0x4b) {
      logRouteTiming(ROUTE, "done", routeStart, { success: false });
      return jsonWithCors(request, { error: "DOCX generation produced an invalid file." }, 500);
    }

    const resumeName =
      String(parsed.optimized_resume?.header?.name ?? "").trim() || "Resume";
    const jdLabel = String(body.jd_label ?? "manual-jd")
      .trim()
      .replace(/\.(docx|pdf)$/i, "")
      .replace(/\s+/g, "-") || "manual-jd";
    const filename = buildExportFilename({
      userName: resumeName,
      companyName: "",
      jobTitle: "",
      fallbackLabel: jdLabel.slice(0, 80),
    });

    logRouteTiming(ROUTE, "done", routeStart, { success: true });
    return new Response(new Uint8Array(docxBuffer), {
      status: 200,
      headers: {
        ...corsHeaders(request),
        "Access-Control-Expose-Headers": "Content-Disposition, X-JBHM-Filename",
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "X-JBHM-Filename": filename,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to render DOCX";
    logRouteTiming(ROUTE, "done", routeStart, { success: false });
    return jsonWithCors(request, { error: msg }, 400);
  }
}
