import { describe, expect, it } from "vitest";

import {
  buildCaptureTagNames,
  extractStructuredJd,
  normalizeExtraction,
  sanitizeSalaryFields,
  validateSalaryCandidate,
} from "@/lib/extraction/normalize";

describe("validateSalaryCandidate", () => {
  it("rejects $140M funding", () => {
    expect(validateSalaryCandidate("$140M in funding")).toBe(false);
  });

  it("rejects $2B valuation", () => {
    expect(validateSalaryCandidate("$2B valuation")).toBe(false);
  });

  it("rejects 401k", () => {
    expect(validateSalaryCandidate("401k matching")).toBe(false);
  });

  it("accepts explicit salary range", () => {
    expect(validateSalaryCandidate("$120k-$160k salary")).toBe(true);
  });
});

describe("sanitizeSalaryFields", () => {
  it("clears invalid funding salary", () => {
    const out = sanitizeSalaryFields({
      salary_text: "$140M in funding",
      salary_min: 140_000_000,
      salary_max: null,
      salary_period: "annual",
    });
    expect(out.salary_text).toBe("");
    expect(out.salary_min).toBeNull();
    expect(out.salary_max).toBeNull();
    expect(out.salary_period).toBeNull();
  });

  it("parses $120k-$160k annual salary", () => {
    const out = sanitizeSalaryFields({
      salary_text: "$120k-$160k salary",
      salary_min: null,
      salary_max: null,
      salary_period: null,
    });
    expect(out.salary_text).toContain("$120k");
    expect(out.salary_min).toBe(120_000);
    expect(out.salary_max).toBe(160_000);
    expect(out.salary_period).toBe("annual");
  });

  it("parses $60/hr hourly", () => {
    const out = sanitizeSalaryFields({
      salary_text: "$60/hr",
      salary_min: null,
      salary_max: null,
      salary_period: "hourly",
    });
    expect(out.salary_min).toBe(60);
    expect(out.salary_max).toBe(60);
    expect(out.salary_period).toBe("hourly");
  });
});

describe("buildCaptureTagNames", () => {
  it("adds full-time and remote tags", () => {
    expect(
      buildCaptureTagNames({
        employment_type: "full-time",
        workplace_type: "remote",
      }),
    ).toEqual(["full-time", "remote"]);
  });

  it("adds contract and hybrid tags", () => {
    expect(
      buildCaptureTagNames({
        employment_type: "contract",
        workplace_type: "hybrid",
      }),
    ).toEqual(["contract", "hybrid"]);
  });
});

describe("extractStructuredJd", () => {
  it("preserves bullet list structure from raw text", () => {
    const raw = [
      "Acme Corp",
      "Senior Engineer",
      "Responsibilities",
      "- Build APIs",
      "- Lead code reviews",
      "- Mentor juniors",
      "Apply now",
    ].join("\n");

    const summarized =
      "Build APIs, lead code reviews, and mentor juniors in a fast-paced environment.";

    const jd = extractStructuredJd(raw, summarized);
    expect(jd).toContain("Responsibilities");
    expect(jd).toContain("- Build APIs");
    expect(jd).toContain("- Lead code reviews");
    expect(jd).not.toContain("Apply now");
  });
});

describe("normalizeExtraction", () => {
  it("clears salary from funding line in model output", () => {
    const out = normalizeExtraction(
      {
        company_name: "Startup",
        job_title: "Engineer",
        location: "Remote",
        salary_text: "$140M Series B",
        salary_min: 140000000,
        salary_max: null,
        cleaned_job_description: "",
      },
      "Raised $140M Series B\n$120k salary not mentioned",
      "Engineer",
    );
    expect(out.salary_text).toBe("");
    expect(out.salary_min).toBeNull();
  });

  it("derives tags from employment and workplace in full pipeline", () => {
    const out = normalizeExtraction(
      {
        employment_type: "full-time",
        workplace_type: "remote",
        tag_names: [],
        cleaned_job_description: "",
      },
      "Full-time remote role\nResponsibilities\n- Ship features",
      "Engineer | Co",
    );
    expect(out.tag_names).toEqual(["full-time", "remote"]);
  });
});
