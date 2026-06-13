import { Buffer } from "buffer";
import {
  exportOptimizedResumeToDocxBuffer,
  normalizeDocxStyleId,
} from "../apps/web/lib/resumes/docx-export";
import { buildExportFilename } from "../apps/web/lib/resumes/filename";
import { parseGptResultText } from "../apps/web/lib/resumes/gpt-result-parse";

(globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer;

export type RenderGptDocxOpts = {
  jd_label?: string;
  docx_style?: string;
};

export type RenderGptDocxResult = {
  arrayBuffer: ArrayBuffer;
  filename: string;
};

/** Build a DOCX ArrayBuffer from raw GPT result text (extension-local, no server). */
export async function renderGptTextToDocx(
  gptText: string,
  opts: RenderGptDocxOpts = {},
): Promise<RenderGptDocxResult> {
  const parsed = parseGptResultText(gptText);
  const docxStyle = normalizeDocxStyleId(opts.docx_style);
  const docxBuffer = await exportOptimizedResumeToDocxBuffer(parsed.optimized_resume, docxStyle);

  if (docxBuffer.length < 4 || docxBuffer[0] !== 0x50 || docxBuffer[1] !== 0x4b) {
    throw new Error("DOCX generation produced an invalid file.");
  }

  const resumeName =
    String(parsed.optimized_resume?.header?.name ?? "").trim() || "Resume";
  const jdLabel =
    String(opts.jd_label ?? "manual-jd")
      .trim()
      .replace(/\.(docx|pdf)$/i, "")
      .replace(/\s+/g, "-") || "manual-jd";
  const filename = buildExportFilename({
    userName: resumeName,
    companyName: "",
    jobTitle: "",
    fallbackLabel: jdLabel.slice(0, 80),
  });

  const bytes =
    docxBuffer instanceof Uint8Array
      ? docxBuffer
      : new Uint8Array(
          docxBuffer.buffer,
          docxBuffer.byteOffset,
          docxBuffer.byteLength,
        );
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

  return { arrayBuffer, filename };
}
