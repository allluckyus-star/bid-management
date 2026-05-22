import type { MockExtraction } from "@/lib/extraction/mock-extract";
import { normalizeExtraction } from "@/lib/extraction/normalize";

const SYSTEM_PROMPT = `You extract structured data from job posting page text for a bid-tracking database.
Input is visible page text (innerText), plus PAGE_TITLE and SOURCE_URL when provided.
Return ONLY one JSON object. No markdown fences, no explanation.

Schema keys: company_name, job_title, location, salary_text, salary_min, salary_max, salary_currency, salary_period,
employment_type, seniority, required_skills, nice_to_have_skills, cleaned_job_description, hiring_contact, confidence.

salary_period: "hourly", "monthly", "annual", or null.
Never use Apply/LinkedIn/Indeed as company_name. cleaned_job_description: JD sections only, no application forms.`;

export async function groqExtractJobData(
  capturedText: string,
  pageTitle: string,
  sourceUrl: string,
): Promise<{ result: MockExtraction; modelLabel: string }> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("GROQ_API_KEY not configured");

  const model = process.env.GROQ_MODEL?.trim() || "llama-3.1-8b-instant";
  const userContent = [
    "Extract job fields from this captured job posting text:\n\n",
    capturedText.slice(0, 18000),
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
