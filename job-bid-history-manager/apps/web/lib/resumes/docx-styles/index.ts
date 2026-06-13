import type { OptimizedResume } from "@/lib/resumes/gpt-result-parse";
import { exportCalibriResumeToDocxBuffer } from "@/lib/resumes/docx-export-calibri";
import { exportChadTaylorPdfResumeToDocxBuffer } from "@/lib/resumes/docx-styles/chad-taylor-pdf";
import { exportChadTaylorResumeToDocxBuffer } from "@/lib/resumes/docx-styles/chad-taylor";
import { exportFlowCvResumeToDocxBuffer } from "@/lib/resumes/docx-styles/flowcv";
import { exportFlowCvSourceResumeToDocxBuffer } from "@/lib/resumes/docx-styles/flowcv-source";
import { normalizeDocxStyleId, type DocxStyleId, DOCX_STYLE_OPTIONS } from "@/lib/resumes/docx-styles/registry";

export { DOCX_STYLE_OPTIONS, normalizeDocxStyleId, type DocxStyleId };

export async function exportOptimizedResumeToDocxBuffer(
  optimized: OptimizedResume,
  styleId?: string | null,
): Promise<Buffer> {
  const style = normalizeDocxStyleId(styleId);
  if (style === "chad-taylor") return exportChadTaylorResumeToDocxBuffer(optimized);
  if (style === "chad-taylor-pdf") return exportChadTaylorPdfResumeToDocxBuffer(optimized);
  if (style === "flowcv") return exportFlowCvResumeToDocxBuffer(optimized);
  if (style === "flowcv-source") return exportFlowCvSourceResumeToDocxBuffer(optimized);
  return exportCalibriResumeToDocxBuffer(optimized);
}
