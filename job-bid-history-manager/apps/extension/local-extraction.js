/**
 * Client-side job field heuristics (free-tier safe mode). Suggestions only — user edits before save.
 */

const MIN_USEFUL_CHARS = 80;

function normalizeText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function titleFromPageTitle(pageTitle) {
  const parts = String(pageTitle || "")
    .split(/\s*[|\-–—]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return { title: parts[0], company: parts[parts.length - 1] };
  }
  return { title: String(pageTitle || "").trim(), company: "" };
}

function inferCompany(text, domain, pageTitle) {
  const fromTitle = titleFromPageTitle(pageTitle);
  if (fromTitle.company && fromTitle.company.length > 1) return fromTitle.company;

  const atMatch = text.match(/\b(?:at|@)\s+([A-Z][A-Za-z0-9&.,'()\- ]{2,60})/);
  if (atMatch) {
    const c = atMatch[1].trim().split(/\s{2,}|\.(?:\s|$)/)[0].trim();
    if (c.length > 1) return c.slice(0, 120);
  }

  if (domain && !/linkedin|indeed|glassdoor|greenhouse|lever/i.test(domain)) {
    const base = domain.replace(/^www\./, "").split(".")[0];
    if (base && base.length > 2) {
      return base.charAt(0).toUpperCase() + base.slice(1);
    }
  }
  return "";
}

function inferLocation(text) {
  const patterns = [
    /(?:^|\n)\s*Location:\s*([^\n]+)/i,
    /(?:^|\n)\s*Job location:\s*([^\n]+)/i,
    /\b(Remote|Hybrid|On[- ]?site)\b[^\n]*/i,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2})\b/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return String(m[1]).trim().slice(0, 120);
    if (m?.[0] && /remote|hybrid|onsite/i.test(m[0])) return m[0].trim().slice(0, 120);
  }
  return "";
}

function inferSalary(text) {
  const m = text.match(
    /\$\s*[\d]{1,3}(?:,\d{3})+(?:\s*[-–—]\s*\$\s*[\d]{1,3}(?:,\d{3})+)?|\$\s*[\d]+k(?:\s*[-–—]\s*\$?\s*[\d]+k)?|\d+k\s*[-–—]\s*\d+k(?:\s*(?:per year|\/yr|annually))?/i,
  );
  return m ? m[0].trim().slice(0, 120) : "";
}

function inferEmploymentType(text) {
  const lower = text.toLowerCase();
  if (/\binternship\b|\bintern\b/.test(lower)) return "internship";
  if (/\bcontract\b|\bcontractor\b/.test(lower)) return "contract";
  if (/\bpart[- ]?time\b/.test(lower)) return "part-time";
  if (/\bfull[- ]?time\b|\bpermanent\b/.test(lower)) return "full-time";
  return "";
}

function inferTitle(text, pageTitle) {
  const fromPage = titleFromPageTitle(pageTitle);
  if (fromPage.title && fromPage.title.length > 3) return fromPage.title.slice(0, 200);

  const firstLine = text.split("\n").map((l) => l.trim()).find((l) => l.length > 8 && l.length < 200);
  if (firstLine && !/^(apply|save|share|sign in)/i.test(firstLine)) return firstLine;
  return fromPage.title.slice(0, 200);
}

/**
 * @param {{ pageTitle?: string, sourceUrl?: string, domain?: string, jdText?: string, extractionSource?: string }} input
 */
function extractJobFieldsLocally(input) {
  const jdText = normalizeText(input.jdText || "");
  const pageTitle = String(input.pageTitle || "");
  const domain = String(input.domain || "");
  const warnings = [];

  const title = inferTitle(jdText, pageTitle);
  const company = inferCompany(jdText, domain, pageTitle);
  const location = inferLocation(jdText);
  const salary = inferSalary(jdText);
  const employmentType = inferEmploymentType(jdText);

  if (!title) warnings.push("Could not detect job title.");
  if (!company) warnings.push("Could not detect company.");
  if (jdText.length < MIN_USEFUL_CHARS) warnings.push("JD text looks short.");

  let confidence = "medium";
  if (title && company && jdText.length > 1500) confidence = "high";
  else if (!title || jdText.length < 500) confidence = "low";

  return {
    title,
    company,
    location,
    salary,
    employmentType,
    confidence,
    warnings,
  };
}

/**
 * @param {string} jdText
 * @returns {"good"|"partial"|"weak"}
 */
function scoreJdQuality(jdText) {
  const len = normalizeText(jdText).length;
  const lower = jdText.toLowerCase();
  const hasSignals =
    /\b(responsibilit|requirement|qualification|what you|about the role|you will)\b/i.test(lower);

  if (len > 1500 && hasSignals) return "good";
  if (len >= 500) return "partial";
  return "weak";
}

function qualityLabel(quality) {
  if (quality === "good") return "Good";
  if (quality === "partial") return "Partial";
  return "Weak";
}
