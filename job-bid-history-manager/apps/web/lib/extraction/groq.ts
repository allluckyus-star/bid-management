import type { JobExtraction } from "@jbhm/shared";
import { normalizeExtraction } from "@/lib/extraction/normalize";

const DEFAULT_GROQ_MAX_CAPTURE_CHARS = 10_000;

const SYSTEM_PROMPT = `You extract structured data from job posting page text for a bid-tracking database.
Input is visible page text (innerText), plus PAGE_TITLE and SOURCE_URL when provided.

Return ONLY one JSON object. No markdown fences, no explanation.
Extract only facts explicitly present in the input. Do not guess or infer missing fields.

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
  full-time if full-time/full time/permanent
  part-time if part-time/part time
  contract if contract/contractor/temporary
  internship if internship/intern
- workplace_type: "remote" | "hybrid" | "onsite" | null
  remote if remote; hybrid if hybrid; onsite if onsite/on-site/in office
- tag_names: array containing ONLY normalized tags from this set (no other tags):
  full-time, part-time, contract, internship, remote, hybrid, onsite
- Do NOT put skills in tag_names. Skills go in required_skills / nice_to_have_skills only.

cleaned_job_description (CRITICAL):
- NOT a summary. NOT rewritten in your own words.
- Extract a subset of the original job posting text only.
- Preserve original wording, line breaks, section headings, bullets (-, •, *), and numbered lists.
- Remove only obvious page noise: Apply button, Save, Share, sign in, login, footer, cookie notice, navigation, similar jobs.
- Keep sections like Responsibilities, Requirements, Qualifications, Benefits, About the role with their bullets intact.
- Do NOT collapse bullets into one paragraph.

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
