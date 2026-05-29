import { resolveUserIdFromBearer } from "@/lib/auth/extension-token";
import { jsonWithCors, optionsResponse } from "@/lib/http/cors";
import { logRouteTiming } from "@/lib/http/log-route-timing";

export const runtime = "nodejs";

const ROUTE = "/api/extension/extract-doc";
const MAX_FILE_BYTES = 12 * 1024 * 1024;

type ExtractDocBody = {
  file_base64?: string;
  file_name?: string;
  mime_type?: string;
};

async function extractDocxText(bytes: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const parsed = await mammoth.extractRawText({ buffer: bytes });
  return String(parsed.value ?? "").trim();
}

async function extractPdfText(bytes: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: bytes });
  try {
    const parsed = await parser.getText();
    return String(parsed.text ?? "").trim();
  } finally {
    await parser.destroy();
  }
}

export async function OPTIONS(request: Request) {
  return optionsResponse(request);
}

/**
 * Stateless text extraction for .docx / .pdf uploads (resume + JD).
 * Parses the file in memory and returns plain text. Stores nothing.
 */
export async function POST(request: Request) {
  const routeStart = Date.now();
  logRouteTiming(ROUTE, "start", routeStart);

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

  let body: ExtractDocBody;
  try {
    body = (await request.json()) as ExtractDocBody;
  } catch {
    return jsonWithCors(request, { error: "Invalid JSON body" }, 400);
  }

  const base64 = String(body.file_base64 ?? "");
  const name = String(body.file_name ?? "").trim().toLowerCase();
  if (!base64) {
    return jsonWithCors(request, { error: "file_base64 is required" }, 400);
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, "base64");
  } catch {
    return jsonWithCors(request, { error: "Could not decode file" }, 400);
  }
  if (bytes.length === 0) {
    return jsonWithCors(request, { error: "File is empty" }, 400);
  }
  if (bytes.length > MAX_FILE_BYTES) {
    return jsonWithCors(request, { error: "File too large (max 12 MB)" }, 413);
  }

  const extractStep = Date.now();
  try {
    let text = "";
    if (name.endsWith(".docx")) {
      text = await extractDocxText(bytes);
    } else if (name.endsWith(".pdf")) {
      text = await extractPdfText(bytes);
    } else {
      return jsonWithCors(request, { error: "Only .docx or .pdf files are supported." }, 400);
    }

    if (!text) {
      return jsonWithCors(
        request,
        { error: "No readable text found in the file." },
        422,
      );
    }

    logRouteTiming(ROUTE, "extraction_done", extractStep, { success: true, textLength: text.length });
    logRouteTiming(ROUTE, "done", routeStart, { success: true });
    return jsonWithCors(request, { ok: true, text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Extraction failed";
    logRouteTiming(ROUTE, "done", routeStart, { success: false });
    return jsonWithCors(request, { error: msg }, 502);
  }
}
