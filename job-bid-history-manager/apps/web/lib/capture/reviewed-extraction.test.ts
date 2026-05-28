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

  it("rejects oversized company", () => {
    const err = validateReviewedFieldLengths({
      company_name: "x".repeat(300),
    });
    expect(err).toContain("company");
  });
});
