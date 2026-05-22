import type { MockExtraction } from "@/lib/extraction/mock-extract";

export function normalizeExtraction(
  data: Record<string, unknown>,
  rawText: string,
  pageTitle: string,
): MockExtraction {
  const skillsReq = Array.isArray(data.required_skills)
    ? (data.required_skills as unknown[]).map(String).filter(Boolean)
    : [];
  const skillsNice = Array.isArray(data.nice_to_have_skills)
    ? (data.nice_to_have_skills as unknown[]).map(String).filter(Boolean)
    : [];

  let salaryText = String(data.salary_text ?? "").trim();
  let salaryMin = toInt(data.salary_min);
  let salaryMax = toInt(data.salary_max);
  let period = normalizePeriod(data.salary_period);

  if (!salaryText && rawText) {
    const line = rawText.split("\n").find((l) => /\$\s*[\d,]+|\d+k/i.test(l));
    if (line) salaryText = line.slice(0, 240);
  }

  const cleaned =
    String(data.cleaned_job_description ?? "").trim() ||
    fallbackClean(rawText);

  return {
    company_name: String(data.company_name ?? "").trim().slice(0, 200),
    job_title: String(data.job_title ?? "").trim().slice(0, 200) || pageTitle.slice(0, 200),
    location: String(data.location ?? "").trim().slice(0, 200),
    salary_text: salaryText.slice(0, 240),
    salary_min: salaryMin,
    salary_max: salaryMax,
    salary_currency: String(data.salary_currency ?? "USD").trim() || "USD",
    salary_period: period,
    cleaned_job_description: cleaned.slice(0, 12000),
    confidence: Math.min(1, Math.max(0, Number(data.confidence) || 0.5)),
  };
}

function toInt(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? Math.round(v) : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

function normalizePeriod(raw: unknown): string | null {
  const low = String(raw ?? "").trim().toLowerCase();
  if (["hourly", "hr", "hour"].includes(low)) return "hourly";
  if (["monthly", "month"].includes(low)) return "monthly";
  if (["annual", "yearly", "year", "annually"].includes(low)) return "annual";
  return null;
}

function fallbackClean(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 2);
  return lines.slice(0, 150).join("\n\n").slice(0, 12000);
}
