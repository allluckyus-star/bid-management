import type { JDContent } from "@jbhm/shared";

const RESUME_JSON_MARKERS = [
  "personal_info",
  "professional_summary",
  "professional_experience",
  "education",
  "skills",
] as const;

function looksLikeResumeJson(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return false;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return false;
    return RESUME_JSON_MARKERS.some((key) => key in parsed);
  } catch {
    return false;
  }
}

function stringFromJsonField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Prefer human-readable JD for View JD; skip resume JSON accidentally stored as cleaned_text. */
export function resolveJdDisplayText(jd: JDContent): string | null {
  const cleaned = String(jd.cleaned_text ?? "").trim();
  if (cleaned && !looksLikeResumeJson(cleaned)) {
    return cleaned;
  }

  const fromJson = stringFromJsonField(jd.extracted_json?.cleaned_job_description);
  if (fromJson && !looksLikeResumeJson(fromJson)) {
    return fromJson;
  }

  if (cleaned && looksLikeResumeJson(cleaned)) {
    return null;
  }

  return cleaned || null;
}
