import { groqExtractJobData } from "@/lib/extraction/groq";
import { mockExtractJobData, type MockExtraction } from "@/lib/extraction/mock-extract";

export type ExtractOutcome = {
  extraction: MockExtraction;
  modelName: string;
  partial: boolean;
};

/** Groq when configured; mock fallback; never throws to caller for capture flow. */
export async function extractJobData(
  capturedText: string,
  pageTitle: string,
  sourceUrl: string,
): Promise<ExtractOutcome> {
  if (process.env.GROQ_API_KEY?.trim()) {
    try {
      const { result, modelLabel } = await groqExtractJobData(
        capturedText,
        pageTitle,
        sourceUrl,
      );
      return { extraction: result, modelName: modelLabel, partial: false };
    } catch (err) {
      console.warn("Groq extraction failed, using mock:", err);
    }
  }

  const extraction = mockExtractJobData(capturedText, pageTitle, sourceUrl);
  return {
    extraction,
    modelName: process.env.GROQ_API_KEY?.trim()
      ? "mock-heuristic-fallback"
      : "mock-heuristic",
    partial: Boolean(process.env.GROQ_API_KEY?.trim()),
  };
}
