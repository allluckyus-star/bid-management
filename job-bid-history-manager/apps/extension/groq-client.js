/**
 * Direct Groq calls from the extension (no JBHM server proxy).
 */

const ALLOWED_EXTRACTION_TAGS = new Set([
  "contract",
  "internship",
  "full-time",
  "part-time",
  "hybrid",
  "onsite",
  "remote",
]);

const EMPLOYMENT_EXTRACTION_TAGS = new Set(["contract", "internship", "full-time", "part-time"]);

const JOB_EXTRACTION_SYSTEM_PROMPT = `Extract job posting fields from visible page text for a bid-tracking and resume-optimization tool.

Return ONLY one JSON object. No markdown. No explanation.
Use ONLY facts explicitly present in the input. Do not guess or invent.

Output keys:
company_name, job_title, location, salary_text, salary_min, salary_max, salary_currency, salary_period, tag_names, cleaned_job_description, confidence

Field meaning:
- job_title = role title.
- company_name = hiring company name.
- location = where the person will work.
- salary_text = exact compensation text copied from the posting.
- cleaned_job_description = useful JD text for resume optimization (select and preserve role-relevant sentences; do not summarize or rewrite unless cleaning noise).

Salary rules:
- salary_text must be "" unless the posting explicitly states compensation/pay/salary/rate.
- Valid salary formats include:
  $..., $.../hr, $.../mo, $.../week, $.../yr,
  $... - $..., $.../hr - $.../hr, $.../mo - $.../mo,
  $.../week - $.../week, $.../yr - $.../yr.
- Do NOT treat company size, revenue, funding, valuation, years, percentages, bonus, equity, 401k, or benefits as salary.
- If salary_text is "", salary_min and salary_max must be null.
- salary_period must be "hourly", "monthly", "weekly", "annual", or null.
- salary_currency should be "USD" only when salary uses $, otherwise use the explicit currency or "".

Tag rules:
- tag_names may contain ONLY: contract, internship, full-time, part-time, hybrid, onsite, remote.
- A job may have both an employment tag and a workplace tag (e.g. full-time + remote).
- Use tags only when explicitly supported by the posting.
- Do NOT put skills in tag_names.
- Do NOT use "contract" because the posting mentions contracts, agreements, or contract lifecycle management. Use "contract" only if the job type is contract.

Cleaned JD rules:
- cleaned_job_description is NOT a summary.
- Do not rewrite the JD into your own structure.
- Select and preserve the useful original JD sections/sentences.
- Keep sections like Responsibilities, Requirements, Qualifications, What you'll do, Who you are, Must-have, Preferred, Skills, Tech Stack, Experience, and Domain Requirements.
- Remove navigation, apply buttons, first-name/last-name forms, benefits, perks, EEO, legal text, privacy notices, cookies, company marketing, footer links, and repeated boilerplate.
- Preserve original wording as much as possible.
- Remove duplicate lines.
- The JD should be useful for optimizing a resume.

Company rules:
- Never use Apply, LinkedIn, Indeed, Glassdoor, Workday, Greenhouse, Lever, ZipRecruiter, or similar platform names as company_name.
- If company or title is unclear, return "".

confidence:
- number from 0 to 1.
- Use high confidence only when title, company, and useful JD content are clearly present.

Return ONLY the JSON object.`;

function parseJsonObject(raw) {
  let t = String(raw || "").trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

function dashIfEmptyGroq(v) {
  const s = String(v ?? "").trim();
  return s || "-";
}

function normalizeTagNames(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const tag = String(item || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-");
    if (!ALLOWED_EXTRACTION_TAGS.has(tag) || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

function employmentTypeFromTags(tagNames) {
  for (const tag of tagNames) {
    if (EMPLOYMENT_EXTRACTION_TAGS.has(tag)) return tag;
  }
  return "";
}

function normalizeLocalExtraction(data, capturedText, pageTitle) {
  if (!data || typeof data !== "object") {
    const titleGuess = String(pageTitle || "")
      .split(/\s*[|\-–—]\s*/)[0]
      ?.trim();
    return {
      job_title: dashIfEmptyGroq(titleGuess),
      company_name: "-",
      location: "-",
      salary_text: "-",
      employment_type: "-",
      tag_names: [],
      cleaned_job_description: String(capturedText || "").slice(0, 15000) || "-",
    };
  }
  const tag_names = normalizeTagNames(data.tag_names);
  return {
    job_title: dashIfEmptyGroq(data.job_title),
    company_name: dashIfEmptyGroq(data.company_name),
    location: dashIfEmptyGroq(data.location),
    salary_text: dashIfEmptyGroq(data.salary_text),
    employment_type: dashIfEmptyGroq(employmentTypeFromTags(tag_names)),
    tag_names,
    cleaned_job_description: dashIfEmptyGroq(data.cleaned_job_description || capturedText),
  };
}

function buildExtractionUserContent(capturedText, pageTitle, sourceUrl) {
  const cleaned = cleanGroqText(capturedText).slice(0, GROQ_MAX_PROMPT_CHARS);
  return [
    "Extract job fields from the tagged job posting text below.",
    "",
    pageTitle ? `<PAGE_TITLE>${pageTitle}</PAGE_TITLE>` : "<PAGE_TITLE></PAGE_TITLE>",
    sourceUrl ? `<SOURCE_URL>${sourceUrl}</SOURCE_URL>` : "<SOURCE_URL></SOURCE_URL>",
    "",
    "<CAPTURED_JOB_TEXT>",
    cleaned,
    "</CAPTURED_JOB_TEXT>",
  ].join("\n");
}

async function groqExtractJobDirect(capturedText, pageTitle, sourceUrl, model) {
  const userContent = buildExtractionUserContent(capturedText, pageTitle, sourceUrl);

  const result = await groqRunWithKeyPool({
    model,
    messages: [
      { role: "system", content: JOB_EXTRACTION_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    temperature: 0.1,
    maxTokens: 4096,
    responseFormat: { type: "json_object" },
  });

  const parsed = parseJsonObject(result.text);
  return {
    ...result,
    extraction: normalizeLocalExtraction(parsed, capturedText, pageTitle),
  };
}

async function groqGenerateDirect(finalPrompt, _purpose, model) {
  const prompt = cleanGroqText(finalPrompt).slice(0, GROQ_MAX_PROMPT_CHARS);
  if (prompt.length < 40) throw new Error("Final prompt is too short.");

  return groqRunWithKeyPool({
    model,
    messages: [
      {
        role: "system",
        content:
          "Follow the user instructions exactly. Return only valid JSON when the user asks for JSON output.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.15,
    maxTokens: 8192,
  });
}

async function groqAnalyzeJdDirect(jdText, model) {
  const text = cleanGroqText(jdText).slice(0, 12000);
  if (text.length < 40) throw new Error("JD text is too short for AI analysis.");

  const prompt = [
    "Analyze this job description and return ONLY a JSON object with keys:",
    "target_title, target_company, seniority, must_have_skills (array), preferred_skills (array),",
    "responsibilities_summary (string), requirements_summary (string), tools_frameworks (array),",
    "cloud_platform (array), model_ai_requirements (array), output_emphasis (string), alignment_warnings (array).",
    "Do not invent facts not in the JD.\n\n",
    text,
  ].join("\n");

  return groqRunWithKeyPool({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    maxTokens: 1024,
  });
}
