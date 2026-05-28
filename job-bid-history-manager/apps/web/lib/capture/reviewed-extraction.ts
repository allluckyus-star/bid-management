import type { EmploymentType, JobExtraction, WorkplaceType } from "@jbhm/shared";
import { mockExtractJobData } from "@/lib/extraction/mock-extract";

const LIMITS = {
  job_title: 200,
  company_name: 200,
  location: 200,
  salary_text: 200,
  tag_name: 48,
  max_tags: 12,
} as const;

export type ReviewedCaptureFields = {
  job_title?: string;
  company_name?: string;
  company?: string;
  location?: string;
  salary_text?: string;
  salary?: string;
  employment_type?: string;
  employmentType?: string;
  tag_names?: string[];
  tags?: string;
  client_reviewed?: boolean;
};

function clamp(value: string | undefined, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function parseTags(raw: string | string[] | undefined): string[] {
  if (Array.isArray(raw)) {
    return raw.map((t) => clamp(t, LIMITS.tag_name)).filter(Boolean).slice(0, LIMITS.max_tags);
  }
  const s = String(raw ?? "").trim();
  if (!s) return [];
  return s
    .split(/[,;|]/)
    .map((t) => clamp(t, LIMITS.tag_name).toLowerCase())
    .filter(Boolean)
    .slice(0, LIMITS.max_tags);
}

function normalizeEmploymentType(raw: string | undefined): EmploymentType | null {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  if (v === "full-time" || v === "part-time" || v === "contract" || v === "internship") {
    return v;
  }
  return null;
}

/** Build extraction from extension-reviewed fields; heuristic fills gaps only. */
export function buildReviewedExtraction(
  fields: ReviewedCaptureFields,
  capturedText: string,
  pageTitle: string,
  sourceUrl: string,
): JobExtraction {
  const base = mockExtractJobData(capturedText, pageTitle, sourceUrl);

  const jobTitle = clamp(fields.job_title, LIMITS.job_title);
  const company = clamp(fields.company_name || fields.company, LIMITS.company_name);
  const location = clamp(fields.location, LIMITS.location);
  const salaryText = clamp(fields.salary_text || fields.salary, LIMITS.salary_text);
  const employment = normalizeEmploymentType(fields.employment_type || fields.employmentType);
  const tags = parseTags(fields.tag_names ?? fields.tags);

  return {
    ...base,
    job_title: jobTitle || base.job_title,
    company_name: company || base.company_name,
    location: location || base.location,
    salary_text: salaryText || base.salary_text,
    employment_type: employment ?? base.employment_type,
    tag_names: tags.length ? tags : base.tag_names,
    cleaned_job_description: capturedText.slice(0, 200_000) || base.cleaned_job_description,
    confidence: Math.max(base.confidence, 0.65),
  };
}

export function validateReviewedFieldLengths(fields: ReviewedCaptureFields): string | null {
  if (clamp(fields.job_title, LIMITS.job_title + 1).length > LIMITS.job_title) {
    return `job_title exceeds ${LIMITS.job_title} characters`;
  }
  if (clamp(fields.company_name || fields.company, LIMITS.company_name + 1).length > LIMITS.company_name) {
    return `company exceeds ${LIMITS.company_name} characters`;
  }
  if (clamp(fields.location, LIMITS.location + 1).length > LIMITS.location) {
    return `location exceeds ${LIMITS.location} characters`;
  }
  const tags = parseTags(fields.tag_names ?? fields.tags);
  if (tags.length > LIMITS.max_tags) {
    return `too many tags (max ${LIMITS.max_tags})`;
  }
  return null;
}
