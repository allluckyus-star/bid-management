export type MockExtraction = {
  company_name: string;
  job_title: string;
  location: string;
  salary_text: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  salary_period: string | null;
  cleaned_job_description: string;
  confidence: number;
};

const NOISE =
  /^(?:share|save|apply now|easy apply|report job|sign in|log in|linkedin|indeed|glassdoor|©)/i;

const INVALID_COMPANY =
  /^(?:apply|apply now|search|menu|home|skip to main content|submit)$/i;

const SALARY_RE =
  /(?:\$\s*[\d]{1,3}(?:,\d{3})+|\$\s*[\d]+|\$\s*[\d]+\s*k\b|\d+k\s*-\s*\d+k)/i;

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

function parseSalaryAmounts(text: string): { min: number | null; max: number | null } {
  const nums: number[] = [];
  for (const m of text.matchAll(/\$\s*([\d,]+)\s*(K)?/gi)) {
    const raw = m[1].replace(/,/g, "");
    const v =
      (m[2] || "").toLowerCase() === "k" ? Math.round(parseFloat(raw) * 1000) : parseInt(raw, 10);
    if (!Number.isNaN(v)) nums.push(v);
  }
  if (!nums.length) return { min: null, max: null };
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

function detectPeriod(text: string): string | null {
  if (/\b(?:\/hr|per\s+hour|hourly)\b/i.test(text)) return "hourly";
  if (/\b(?:\/yr|per\s+year|annual|yearly)\b/i.test(text)) return "annual";
  if (/\b(?:per\s+month|monthly)\b/i.test(text)) return "monthly";
  return null;
}

function fallbackCleanJd(lines: string[]): string {
  const keep: string[] = [];
  const section = /responsibilit|requirement|qualification|about (?:the )?(?:role|job)|benefits|skills/i;
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.length < 3 || NOISE.test(t)) continue;
    if (section.test(t) || keep.length > 0 || t.length > 40) {
      keep.push(t);
    }
  }
  return keep.slice(0, 200).join("\n\n").slice(0, 12000);
}

/** Phase 2 heuristic extraction from innerText only. */
export function mockExtractJobData(
  capturedText: string,
  pageTitle: string,
  _sourceUrl: string,
): MockExtraction {
  const lines = capturedText
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 1);

  const { title: titleFromPt, company: companyFromPt } = titleFromPageTitle(pageTitle);
  let jobTitle = titleFromPt;
  if (/^job description$/i.test(jobTitle)) jobTitle = "";

  let company = INVALID_COMPANY.test(companyFromPt) ? "" : companyFromPt;
  const inferred = inferCompany(capturedText.slice(0, 8000));
  if (inferred) company = inferred;

  let location = "";
  let salaryText = "";
  for (const line of lines) {
    if (
      !location &&
      /\b(remote|hybrid|on-?site)\b/i.test(line) &&
      line.length < 200
    ) {
      location = line.slice(0, 200);
    }
    if (!salaryText && SALARY_RE.test(line) && line.length < 280) {
      salaryText = line.slice(0, 240);
    }
  }

  if (!jobTitle) {
    for (const line of lines.slice(0, 20)) {
      if (
        /\b(engineer|developer|manager|analyst|designer|architect|lead|director)\b/i.test(
          line,
        )
      ) {
        jobTitle = line.slice(0, 200);
        break;
      }
    }
  }

  const { min, max } = parseSalaryAmounts(salaryText);
  const period = detectPeriod(salaryText);

  return {
    company_name: company,
    job_title: jobTitle,
    location,
    salary_text: salaryText,
    salary_min: min,
    salary_max: max,
    salary_currency: "USD",
    salary_period: period,
    cleaned_job_description: fallbackCleanJd(lines),
    confidence: 0.35,
  };
}
