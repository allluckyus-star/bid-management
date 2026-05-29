import type { JobExtraction } from "@jbhm/shared";
import { normalizeExtraction } from "@/lib/extraction/normalize";

const DEFAULT_GROQ_MAX_CAPTURE_CHARS = 10_000;

const SYSTEM_PROMPT = `You extract structured data from job posting page text for a bid-tracking database.
Input is visible page text (innerText), plus PAGE_TITLE and SOURCE_URL when provided.

Return ONLY one JSON object. No markdown fences, no explanation.
Extract only facts explicitly present in the input. Do not guess or infer missing fields.

ANTI-HALLUCINATION (CRITICAL): Use ONLY text that appears in the provided input. NEVER invent, fabricate, or write a
generic job description, responsibilities, requirements, skills, salary, or company that is not literally present in the
input. If the input is mostly navigation/menus/marketing and contains little or no real job description, return the
role-relevant text that IS present, and use "" (or empty arrays) for anything not present — do NOT fill gaps with a
plausible-sounding template.

JSON schema keys:
company_name, job_title, location,
salary_text, salary_min, salary_max, salary_currency, salary_period,
employment_type, workplace_type, tag_names,
required_skills, nice_to_have_skills,
cleaned_job_description, hiring_contact, confidence

salary_period: "hourly", "monthly", "annual", or null.

SALARY RULES:
- salary_text must contain ONLY compensation/pay range text copied from the posting.
- salary_text must be "" if the page does not explicitly state pay, base salary, compensation, hourly rate, annual salary, monthly salary, or pay range.
- Do NOT treat as salary: funding, revenue, valuation, company size, market size, users, model size, parameter count, years, percentages, equity valuation, Series A/B/C, 401k, bonus unless an explicit compensation dollar amount.
- Reject $XM/$XB (million/billion) unless the same phrase clearly says annual salary/compensation (extremely rare).
- If salary_text is "", salary_min and salary_max must be null.
- salary_min/salary_max: normalized USD integers only when compensation is clear.
- Examples:
  "$120k - $160k base salary" => salary_text "$120k - $160k base salary", min 120000, max 160000, period "annual"
  "$60/hr" => min 60, max 60, period "hourly"
  "$140M in funding" => salary_text "", min null, max null
  "401k matching" => salary_text "", min null, max null

EMPLOYMENT / WORKPLACE / TAGS:
- employment_type: "full-time" | "part-time" | "contract" | "internship" | null
  full-time if full-time/full time/permanent/"regular" position type
  part-time if part-time/part time
  contract if the ROLE itself is contract/contractor/temporary/fixed-term
  internship if internship/intern
- workplace_type: "remote" | "hybrid" | "onsite" | null
  remote if fully remote; hybrid if hybrid; onsite if onsite/on-site/in office/in-office
  Use the job's "Job Designation" / "Workplace" / "Location type" field when present.
- tag_names: array of normalized tags, ONLY from this exact set (no other values):
  full-time, part-time, contract, internship, remote, hybrid, onsite
  - Include BOTH the employment tag AND the workplace tag when each is known (e.g. ["full-time","hybrid"]).
  - There can be MULTIPLE tags. Omit a tag if it is genuinely not stated.
  - Map "Regular" position type to "full-time". Map "Hybrid" job designation to "hybrid", "In Office" to "onsite", "Remote" to "remote".
- TAG SAFETY (CRITICAL): derive tags ONLY from words describing the employment relationship or work location.
  NEVER derive a tag from product names, company descriptions, or unrelated business text.
  Example: "Contract Lifecycle Management", "contracts", "agreements", "e-signature" must NOT produce the "contract" tag.
  Only output "contract" when the posting explicitly says the position/role is a contract/contractor/temporary job.
- Do NOT put skills in tag_names. Skills go in required_skills / nice_to_have_skills only.

cleaned_job_description (CRITICAL):
- NOT a summary. NOT rewritten in your own words. Extract a subset of the original posting text only.
- Preserve original wording, line breaks, section headings, bullets (-, •, *), and numbered lists. Do NOT collapse bullets into one paragraph.
- KEEP ONLY content that describes THE ROLE itself:
  * the role summary / "About the role" / "What you'll do" / role overview
  * Responsibilities / duties / "what you will do"
  * Requirements / Qualifications / "What you bring" / "Basic" / "Preferred" / minimum & preferred experience
  * Required and nice-to-have skills, tools, technologies, and technical stack
- REMOVE all of the following non-role content entirely:
  * company overview / "Company Overview" / "About us" / marketing or mission boilerplate
  * benefits & perks (PTO, paid time off, parental leave, health/medical, retirement/401k, learning/development, bonus, stock/RSU, compassionate leave)
  * wage transparency / pay-range legal paragraphs (the dollar figures still go to salary_text, but keep the legal prose out of the description)
  * EEO / equal opportunity / diversity / "Know Your Rights" statements
  * accommodation notices, privacy notices, "Life at <company>", "Working here"
  * application instructions ("Apply for this job", "Returning candidate", "Log back in", "Share on your newsfeed", "Need help finding the right job")
  * navigation menus, product/industry/solution link lists, footer link lists, language/region selectors, social links, "Skip to Main Content"
- The result should read as: role intro + responsibilities + requirements/qualifications + skills, and nothing else.

Never use Apply/LinkedIn/Indeed as company_name.`;

export function groqMaxCaptureChars(): number {
  const raw = process.env.GROQ_MAX_CAPTURE_CHARS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : DEFAULT_GROQ_MAX_CAPTURE_CHARS;
  if (!Number.isFinite(n) || n < 1000) return DEFAULT_GROQ_MAX_CAPTURE_CHARS;
  return Math.min(n, 30_000);
}

/** Trim and normalize whitespace before sending to Groq. */
export function cleanTextForGroq(text: string): string {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function groqExtractJobData(
  capturedText: string,
  pageTitle: string,
  sourceUrl: string,
): Promise<{ result: JobExtraction; modelLabel: string }> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("GROQ_API_KEY not configured");

  const model = process.env.GROQ_MODEL?.trim() || "llama-3.1-8b-instant";
  const maxChars = groqMaxCaptureChars();
  const cleaned = cleanTextForGroq(capturedText).slice(0, maxChars);
  const userContent = [
    "Extract job fields from this captured job posting text:\n\n",
    cleaned,
    pageTitle ? `\n\nPAGE_TITLE: ${pageTitle}` : "",
    sourceUrl ? `\nSOURCE_URL: ${sourceUrl}` : "",
  ].join("");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `Groq error ${res.status}`);
  }

  const payload = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = payload.choices?.[0]?.message?.content ?? "";
  const data = parseJson(raw);
  const result = normalizeExtraction(data, capturedText, pageTitle);
  return { result, modelLabel: `groq:${model}` };
}

function parseJson(text: string): Record<string, unknown> {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t) as Record<string, unknown>;
}
