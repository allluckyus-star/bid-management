import {
  CAPTURE_TAG_NAMES,
  type CaptureTagName,
  type EmploymentType,
  type JobExtraction,
  type SalaryPeriod,
  type WorkplaceType,
} from "@jbhm/shared";

const ALLOWED_TAGS = new Set<string>(CAPTURE_TAG_NAMES);

const SALARY_REJECT_RE =
  /\b(?:funding|revenue|valuation|valued at|company size|market size|users|customers|raised|series\s+[a-d]|401\s*k|equity|stock options?|bonus only|parameter|model size|billion|million users)\b/i;

const MONEY_M_B_RE = /\$\s*[\d.,]+\s*[MB]\b/i;

const COMPENSATION_CONTEXT_RE =
  /\b(?:salary|compensation|pay range|base pay|base salary|hourly rate|annual salary|monthly salary|per hour|\/hr|\/yr|pay band|wage)\b/i;

const NOISE_LINE_RE =
  /^(?:apply(?:\s+now)?|easy apply|save(?:\s+job)?|share|sign in|log in|linkedin|indeed|glassdoor|report job|skip to|cookie|©|copyright)/i;

const JD_START_HEADING_RE =
  /^(?:about (?:the )?(?:role|job|position)|job description|description|responsibilities|what you(?:'ll| will) do|what we're looking for|duties|requirements|qualifications|skills|benefits|who you are|the role|your role)/i;

const JD_END_RE =
  /^(?:apply now|easy apply|similar jobs|more jobs|people also viewed|recommended jobs|©|cookie policy)/i;

/** Reject salary_text that is funding, valuation, 401k, or $XM/$XB without compensation context. */
export function validateSalaryCandidate(salaryText: string): boolean {
  const t = salaryText.trim();
  if (!t) return false;
  if (SALARY_REJECT_RE.test(t)) return false;
  if (MONEY_M_B_RE.test(t) && !COMPENSATION_CONTEXT_RE.test(t)) return false;
  if (/\$\s*[\d.,]+\s*[MB]\b/i.test(t)) {
    const m = t.match(/\$\s*([\d.,]+)\s*([MB])\b/i);
    if (m) {
      const num = parseFloat(m[1].replace(/,/g, ""));
      const mult = m[2].toUpperCase() === "M" ? 1_000_000 : 1_000_000_000;
      if (Number.isFinite(num) && num * mult > 1_000_000) return false;
    }
  }
  return true;
}

export function parseSalaryAmounts(
  text: string,
): { min: number | null; max: number | null } {
  const nums: number[] = [];
  for (const m of text.matchAll(/\$\s*([\d,]+(?:\.\d+)?)\s*(K|M|B)?/gi)) {
    const raw = m[1].replace(/,/g, "");
    const suffix = (m[2] ?? "").toUpperCase();
    let v = parseFloat(raw);
    if (!Number.isFinite(v)) continue;
    if (suffix === "K") v = Math.round(v * 1000);
    else if (suffix === "M" || suffix === "B") continue;
    else v = Math.round(v);
    if (v > 0 && v <= 10_000_000) nums.push(v);
  }
  for (const m of text.matchAll(/\b([\d]{2,3})\s*k\s*(?:-|to|–)\s*([\d]{2,3})\s*k\b/gi)) {
    nums.push(parseInt(m[1], 10) * 1000, parseInt(m[2], 10) * 1000);
  }
  if (!nums.length) return { min: null, max: null };
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

function normalizePeriod(raw: unknown): SalaryPeriod | null {
  const low = String(raw ?? "").trim().toLowerCase();
  if (["hourly", "hr", "hour", "/hr"].some((x) => low.includes(x))) return "hourly";
  if (["monthly", "month", "/mo"].some((x) => low.includes(x))) return "monthly";
  if (["annual", "yearly", "year", "annually", "/yr"].some((x) => low.includes(x)))
    return "annual";
  if (/\b(?:\/hr|per\s+hour|hourly)\b/i.test(low)) return "hourly";
  if (/\b(?:per\s+month|monthly)\b/i.test(low)) return "monthly";
  if (/\b(?:per\s+year|annual|yearly)\b/i.test(low)) return "annual";
  return null;
}

function detectPeriodFromText(text: string): SalaryPeriod | null {
  if (/\b(?:\/hr|per\s+hour|hourly)\b/i.test(text)) return "hourly";
  if (/\b(?:\/mo|per\s+month|monthly)\b/i.test(text)) return "monthly";
  if (/\b(?:\/yr|per\s+year|annual|yearly|base\s+salary|\bsalary\b)\b/i.test(text))
    return "annual";
  if (/\d+\s*k\b/i.test(text) && !/\b(?:\/hr|hourly)\b/i.test(text)) return "annual";
  return null;
}

export function sanitizeSalaryFields(input: {
  salary_text: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: SalaryPeriod | null;
}): {
  salary_text: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: SalaryPeriod | null;
} {
  let salaryText = input.salary_text.trim();
  let salaryMin = input.salary_min;
  let salaryMax = input.salary_max;
  let period = input.salary_period;

  if (!validateSalaryCandidate(salaryText)) {
    return {
      salary_text: "",
      salary_min: null,
      salary_max: null,
      salary_period: null,
    };
  }

  if (salaryMin == null && salaryMax == null) {
    const parsed = parseSalaryAmounts(salaryText);
    salaryMin = parsed.min;
    salaryMax = parsed.max;
  }
  if (!period) period = detectPeriodFromText(salaryText);

  if (period === "annual") {
    if (
      (salaryMin != null && salaryMin > 1_000_000) ||
      (salaryMax != null && salaryMax > 1_000_000)
    ) {
      return {
        salary_text: "",
        salary_min: null,
        salary_max: null,
        salary_period: null,
      };
    }
  }
  if (period === "hourly") {
    if (
      (salaryMin != null && salaryMin > 1000) ||
      (salaryMax != null && salaryMax > 1000)
    ) {
      return {
        salary_text: "",
        salary_min: null,
        salary_max: null,
        salary_period: null,
      };
    }
  }
  if (period === "monthly") {
    if (
      (salaryMin != null && salaryMin > 100_000) ||
      (salaryMax != null && salaryMax > 100_000)
    ) {
      return {
        salary_text: "",
        salary_min: null,
        salary_max: null,
        salary_period: null,
      };
    }
  }

  if (!salaryText) {
    return {
      salary_text: "",
      salary_min: null,
      salary_max: null,
      salary_period: null,
    };
  }

  return {
    salary_text: salaryText.slice(0, 240),
    salary_min: salaryMin,
    salary_max: salaryMax,
    salary_period: period,
  };
}

export function normalizeEmploymentType(raw: unknown): EmploymentType | null {
  const low = String(raw ?? "").trim().toLowerCase();
  if (!low) return null;
  if (/\b(?:full[- ]?time|permanent)\b/.test(low)) return "full-time";
  if (/\bpart[- ]?time\b/.test(low)) return "part-time";
  if (/\b(?:contract|contractor|temporary|temp)\b/.test(low)) return "contract";
  if (/\b(?:internship|intern)\b/.test(low)) return "internship";
  return null;
}

export function normalizeWorkplaceType(raw: unknown): WorkplaceType | null {
  const low = String(raw ?? "").trim().toLowerCase();
  if (!low) return null;
  if (/\bremote\b/.test(low)) return "remote";
  if (/\bhybrid\b/.test(low)) return "hybrid";
  if (/\b(?:on[- ]?site|in[- ]?office|office[- ]?based)\b/.test(low)) return "onsite";
  return null;
}

export function detectEmploymentFromText(text: string): EmploymentType | null {
  const sample = text.slice(0, 12000).toLowerCase();
  if (/\b(?:full[- ]?time|permanent)\b/.test(sample)) return "full-time";
  if (/\bpart[- ]?time\b/.test(sample)) return "part-time";
  if (/\b(?:contract|contractor|temporary)\b/.test(sample)) return "contract";
  if (/\b(?:internship|intern)\b/.test(sample)) return "internship";
  return null;
}

export function detectWorkplaceFromText(text: string): WorkplaceType | null {
  const sample = text.slice(0, 12000).toLowerCase();
  if (/\bhybrid\b/.test(sample)) return "hybrid";
  if (/\bremote\b/.test(sample)) return "remote";
  if (/\b(?:on[- ]?site|in[- ]?office)\b/.test(sample)) return "onsite";
  return null;
}

export function buildCaptureTagNames(opts: {
  employment_type: EmploymentType | null;
  workplace_type: WorkplaceType | null;
  tag_names?: unknown;
}): CaptureTagName[] {
  const out = new Set<CaptureTagName>();
  if (opts.employment_type && ALLOWED_TAGS.has(opts.employment_type)) {
    out.add(opts.employment_type);
  }
  if (opts.workplace_type && ALLOWED_TAGS.has(opts.workplace_type)) {
    out.add(opts.workplace_type);
  }
  if (Array.isArray(opts.tag_names)) {
    for (const raw of opts.tag_names) {
      const name = String(raw).trim().toLowerCase();
      if (ALLOWED_TAGS.has(name)) out.add(name as CaptureTagName);
    }
  }
  return [...out].sort();
}

function preservesStructure(text: string): boolean {
  const lines = text.split(/\r?\n/);
  const nonEmpty = lines.filter((l) => l.trim()).length;
  if (nonEmpty >= 4 && lines.length >= 4) return true;
  if (/^[\s]*(?:[-•*●▪]|\d+[.)])\s+/m.test(text)) return true;
  if (lines.filter((l) => JD_START_HEADING_RE.test(l.trim())).length >= 1 && nonEmpty >= 3)
    return true;
  return false;
}

function looksSummarized(model: string, rawText: string): boolean {
  const modelTrim = model.trim();
  if (!modelTrim) return true;
  const rawJd = extractJdFromRaw(rawText);
  const modelLines = modelTrim.split(/\r?\n/).filter((l) => l.trim());
  const rawLines = rawJd.split(/\r?\n/).filter((l) => l.trim());
  if (modelLines.length < 3 && modelTrim.length > 400) return true;
  if (rawLines.length >= 5 && modelTrim.length < rawJd.length * 0.45) return true;
  const bulletRe = /^[\s]*(?:[-•*●▪]|\d+[.)])\s+/;
  const rawBullets = rawLines.filter((l) => bulletRe.test(l)).length;
  const modelBullets = modelLines.filter((l) => bulletRe.test(l)).length;
  if (rawBullets >= 3 && modelBullets < Math.max(1, rawBullets * 0.4)) return true;
  if (rawJd.length > 300 && !modelTrim.includes("\n") && modelTrim.length > 200) return true;
  return false;
}

/** Deterministic JD subset from raw page text — preserves line breaks and bullets. */
export function extractJdFromRaw(rawText: string): string {
  const lines = rawText.split(/\r?\n/);
  let inJd = false;
  const kept: string[] = [];
  let endHits = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!inJd) {
      if (JD_START_HEADING_RE.test(trimmed)) {
        inJd = true;
        kept.push(line);
        continue;
      }
      if (
        trimmed.length > 0 &&
        /responsibilit|requirement|qualification|what you(?:'ll| will)|benefits/i.test(
          trimmed,
        ) &&
        trimmed.length < 120
      ) {
        inJd = true;
        kept.push(line);
      }
      continue;
    }

    if (JD_END_RE.test(trimmed)) {
      endHits += 1;
      if (endHits >= 1) break;
      continue;
    }
    if (NOISE_LINE_RE.test(trimmed)) continue;

    kept.push(line);
  }

  if (kept.length > 0) {
    return kept.join("\n").trim().slice(0, 12000);
  }

  return fallbackJdFromRaw(lines);
}

function fallbackJdFromRaw(lines: string[]): string {
  const kept: string[] = [];
  let started = false;
  let skippedHeader = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!started) {
      if (NOISE_LINE_RE.test(trimmed) || trimmed.length < 3) {
        skippedHeader += 1;
        if (skippedHeader > 40) break;
        continue;
      }
      if (trimmed.length < 8 && skippedHeader < 25) continue;
      started = true;
    }
    if (JD_END_RE.test(trimmed)) break;
    if (NOISE_LINE_RE.test(trimmed)) continue;
    kept.push(line);
    if (kept.length >= 250) break;
  }

  return kept.join("\n").trim().slice(0, 12000);
}

/** Prefer model JD when it preserves structure; otherwise use deterministic extraction. */
export function extractStructuredJd(rawText: string, modelCleanedText: string): string {
  const model = modelCleanedText.trim();
  const rawJd = extractJdFromRaw(rawText);

  if (!model) return rawJd;
  if (looksSummarized(model, rawText)) return rawJd;
  if (!preservesStructure(model) && preservesStructure(rawJd)) return rawJd;
  if (rawJd.length > 200 && model.length < rawJd.length * 0.5) return rawJd;
  return model.slice(0, 12000);
}

function toInt(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? Math.round(v) : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

export function normalizeExtraction(
  data: Record<string, unknown>,
  rawText: string,
  pageTitle: string,
): JobExtraction {
  const skillsReq = Array.isArray(data.required_skills)
    ? (data.required_skills as unknown[]).map(String).filter(Boolean)
    : [];
  const skillsNice = Array.isArray(data.nice_to_have_skills)
    ? (data.nice_to_have_skills as unknown[]).map(String).filter(Boolean)
    : [];

  const employmentType =
    normalizeEmploymentType(data.employment_type) ?? detectEmploymentFromText(rawText);
  const workplaceType =
    normalizeWorkplaceType(data.workplace_type) ?? detectWorkplaceFromText(rawText);

  const tagNames = buildCaptureTagNames({
    employment_type: employmentType,
    workplace_type: workplaceType,
    tag_names: data.tag_names,
  });

  const salary = sanitizeSalaryFields({
    salary_text: String(data.salary_text ?? "").trim(),
    salary_min: toInt(data.salary_min),
    salary_max: toInt(data.salary_max),
    salary_period: normalizePeriod(data.salary_period),
  });

  const modelJd = String(data.cleaned_job_description ?? "").trim();
  const cleaned = extractStructuredJd(rawText, modelJd);

  const hiringRaw = data.hiring_contact;
  const hiringContact =
    hiringRaw == null || hiringRaw === ""
      ? null
      : String(hiringRaw).trim().slice(0, 200) || null;

  return {
    company_name: String(data.company_name ?? "").trim().slice(0, 200),
    job_title:
      String(data.job_title ?? "").trim().slice(0, 200) ||
      pageTitle.slice(0, 200),
    location: String(data.location ?? "").trim().slice(0, 200),
    salary_text: salary.salary_text,
    salary_min: salary.salary_min,
    salary_max: salary.salary_max,
    salary_currency: String(data.salary_currency ?? "USD").trim() || "USD",
    salary_period: salary.salary_period,
    employment_type: employmentType,
    workplace_type: workplaceType,
    tag_names: tagNames,
    required_skills: skillsReq.slice(0, 40),
    nice_to_have_skills: skillsNice.slice(0, 40),
    cleaned_job_description: cleaned,
    hiring_contact: hiringContact,
    confidence: Math.min(1, Math.max(0, Number(data.confidence) || 0.5)),
  };
}
