import { describe, expect, it } from "vitest";
import { buildReviewedExtraction, validateReviewedFieldLengths } from "./reviewed-extraction";

describe("buildReviewedExtraction", () => {
  it("uses reviewed fields over heuristic defaults", () => {
    const text = "a".repeat(120);
    const out = buildReviewedExtraction(
      {
        client_reviewed: true,
        job_title: "Senior Engineer",
        company_name: "Acme Corp",
        location: "Remote",
      },
      text,
      "Senior Engineer | Acme",
      "https://example.com/jobs/1",
    );
    expect(out.job_title).toBe("Senior Engineer");
    expect(out.company_name).toBe("Acme Corp");
    expect(out.location).toBe("Remote");
  });

  it("prefers jd_text over captured_text for cleaned_job_description", () => {
    const jd = "Responsibilities:\n- Build APIs\n".repeat(10);
    const gptJson = JSON.stringify({ personal_info: { name: "Test" } });
    const out = buildReviewedExtraction(
      {
        client_reviewed: true,
        jd_text: jd,
        job_title: "Engineer",
      },
      gptJson,
      "Engineer",
      "https://example.com/jobs/2",
    );
    expect(out.cleaned_job_description?.trim()).toBe(jd.trim());
    expect(out.cleaned_job_description).not.toContain("personal_info");
  });

  it("rejects oversized company", () => {
    const err = validateReviewedFieldLengths({
      company_name: "x".repeat(300),
    });
    expect(err).toContain("company");
  });
});
