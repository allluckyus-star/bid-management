import { describe, expect, it } from "vitest";

import { extractJsonObject, parseGptResultText } from "@/lib/resumes/gpt-result-parse";

const minimalResume = {
  optimized_resume: {
    header: { name: "Jane Doe" },
    sections: [{ type: "summary", content: "Engineer" }],
  },
};

describe("gpt-result-parse", () => {
  it("parses JSON with unescaped newlines inside string values", () => {
    const raw = `{
  "optimized_resume": {
    "header": { "name": "Jane" },
    "sections": [{ "type": "summary", "content": "Line one
Line two" }]
  }
}`;
    const parsed = parseGptResultText(raw);
    expect(parsed.optimized_resume.header).toEqual({ name: "Jane" });
  });

  it("extracts largest object from ChatGPT preamble + JSON", () => {
    const wrapped = `Here is your resume:\n${JSON.stringify(minimalResume)}`;
    const obj = extractJsonObject(wrapped);
    expect(obj?.optimized_resume).toBeTruthy();
  });

  it("parses fenced json blocks", () => {
    const raw = "Sure!\n```json\n" + JSON.stringify(minimalResume) + "\n```";
    const parsed = parseGptResultText(raw);
    expect(parsed.optimized_resume.sections.length).toBe(1);
  });

  it("strips trailing commas before parse", () => {
    const raw = `{
  "optimized_resume": {
    "header": { "name": "Jane" },
    "sections": [{ "type": "summary", "content": "Ok" },],
  },
}`;
    const parsed = parseGptResultText(raw);
    expect(parsed.optimized_resume.header).toEqual({ name: "Jane" });
  });
});
