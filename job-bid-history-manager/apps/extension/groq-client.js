/**
 * Direct Groq calls from the extension (no JBHM server proxy).
 */

const JOB_EXTRACTION_SYSTEM_PROMPT = `You extract structured data from job posting page text for a bid-tracking database.
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

EMPLOYMENT / WORKPLACE / TAGS:
- employment_type: "full-time" | "part-time" | "contract" | "internship" | null
- workplace_type: "remote" | "hybrid" | "onsite" | null
- tag_names: array using ONLY: full-time, part-time, contract, internship, remote, hybrid, onsite
- TAG SAFETY (CRITICAL): derive tags ONLY from words describing the employment relationship or work location.
  NEVER derive a tag from product names ("Contract Lifecycle Management", "contracts", "agreements").
  Only output "contract" when the posting explicitly says the position/role is a contract job.
- Do NOT put skills in tag_names.

cleaned_job_description (CRITICAL):
- NOT a summary. Extract a subset of the original posting text only.
- KEEP ONLY: role summary, responsibilities, requirements, qualifications, skills/tech stack.
- REMOVE: company overview, benefits/perks, EEO, navigation, application instructions.

Never use Apply/LinkedIn/Indeed as company_name.`;

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
  return {
    job_title: dashIfEmptyGroq(data.job_title),
    company_name: dashIfEmptyGroq(data.company_name),
    location: dashIfEmptyGroq(data.location),
    salary_text: dashIfEmptyGroq(data.salary_text),
    employment_type: dashIfEmptyGroq(data.employment_type),
    tag_names: Array.isArray(data.tag_names) ? data.tag_names.filter(Boolean) : [],
    cleaned_job_description: dashIfEmptyGroq(data.cleaned_job_description || capturedText),
  };
}

async function groqExtractJobDirect(capturedText, pageTitle, sourceUrl, model) {
  const cleaned = cleanGroqText(capturedText).slice(0, GROQ_MAX_PROMPT_CHARS);
  const userContent = [
    "Extract job fields from this captured job posting text:\n\n",
    cleaned,
    pageTitle ? `\n\nPAGE_TITLE: ${pageTitle}` : "",
    sourceUrl ? `\nSOURCE_URL: ${sourceUrl}` : "",
  ].join("");

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
