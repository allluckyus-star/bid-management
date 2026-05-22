import type { JobExtraction } from "@jbhm/shared";
import {
  detectEmploymentFromText,
  detectWorkplaceFromText,
  normalizeExtraction,
  parseSalaryAmounts,
} from "@/lib/extraction/normalize";

export type { JobExtraction };

const NOISE =
  /^(?:share|save|apply now|easy apply|report job|sign in|log in|linkedin|indeed|glassdoor|©)/i;

const INVALID_COMPANY =
  /^(?:apply|apply now|search|menu|home|skip to main content|submit)$/i;

const COMPENSATION_LINE_RE =
  /\b(?:salary|compensation|pay range|base pay|base salary|hourly|\/hr|per year|annual|pay band)\b/i;

const SALARY_AMOUNT_RE =
  /\$\s*[\d]{1,3}(?:,\d{3})+|\$\s*[\d]+|\$\s*[\d]+\s*k\b|\d+k\s*-\s*\d+k/i;

function titleFromPageTitle(pageTitle: string): { title: string; company: string } {
  const parts = pageTitle.split(/\s*[|\-–—]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { title: parts[0], company: parts[parts.length - 1] };
  }
  return { title: pageTitle.trim(), company: "" };
}

function inferCompany(text: string): string {
  const m = text.match(/\b(?:at|@)\s+([A-Z][A-Za-z0-9&.,'()\- ]{2,60})/);
  if (m) {
    const c = m[1].trim().split(/\s{2,}|\.(?:\s|$)/)[0].trim();
    if (c && !INVALID_COMPANY.test(c)) return c.slice(0, 120);
  }
  return "";
}

function detectPeriod(text: string): "hourly" | "monthly" | "annual" | null {
  if (/\b(?:\/hr|per\s+hour|hourly)\b/i.test(text)) return "hourly";
  if (/\b(?:\/yr|per\s+year|annual|yearly|base\s+salary)\b/i.test(text)) return "annual";
  if (/\b(?:per\s+month|monthly)\b/i.test(text)) return "monthly";
  return null;
}

/** Phase 2 heuristic extraction from innerText only; normalized through shared pipeline. */
export function mockExtractJobData(
  capturedText: string,
  pageTitle: string,
  _sourceUrl: string,
): JobExtraction {
  const lines = capturedText
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 1);

  const { title: titleFromPt, company: companyFromPt } = titleFromPageTitle(pageTitle);
  let jobTitle = titleFromPt;
  if (/^job description$/i.test(jobTitle)) jobTitle = "";

  let company = INVALID_COMPANY.test(companyFromPt) ? "" : companyFromPt;
  const inferred = inferCompany(capturedText.slice(0, 8000));
  if (inferred) company = inferred;

  let location = "";
  let salaryText = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      !location &&
      /\b(remote|hybrid|on-?site|in office)\b/i.test(trimmed) &&
      trimmed.length < 200
    ) {
      location = trimmed.slice(0, 200);
    }
    if (
      !salaryText &&
      COMPENSATION_LINE_RE.test(trimmed) &&
      SALARY_AMOUNT_RE.test(trimmed) &&
      trimmed.length < 280 &&
      !/\bfunding\b|\bvaluation\b|\bseries\s+[a-d]\b/i.test(trimmed)
    ) {
      salaryText = trimmed.slice(0, 240);
    }
  }

  if (!jobTitle) {
    for (const line of lines.slice(0, 20)) {
      if (
        /\b(engineer|developer|manager|analyst|designer|architect|lead|director)\b/i.test(
          line,
        )
      ) {
        jobTitle = line.trim().slice(0, 200);
        break;
      }
    }
  }

  const { min, max } = parseSalaryAmounts(salaryText);
  const period = detectPeriod(salaryText);
  const employment = detectEmploymentFromText(capturedText);
  const workplace = detectWorkplaceFromText(capturedText);

  return normalizeExtraction(
    {
      company_name: company,
      job_title: jobTitle,
      location,
      salary_text: salaryText,
      salary_min: min,
      salary_max: max,
      salary_currency: "USD",
      salary_period: period,
      employment_type: employment,
      workplace_type: workplace,
      tag_names: [],
      required_skills: [],
      nice_to_have_skills: [],
      cleaned_job_description: "",
      hiring_contact: null,
      confidence: 0.35,
    },
    capturedText,
    pageTitle,
  );
}
