import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { exportOptimizedResumeToDocxBuffer, normalizeDocxStyleId } from "@/lib/resumes/docx-export";

function readDocxXml(buf: Buffer, entry: string): string {
  const dir = mkdtempSync(join(tmpdir(), "jbhm-docx-"));
  const path = join(dir, "sample.docx");
  writeFileSync(path, buf);
  return execFileSync(
    "python",
    [
      "-c",
      `import zipfile,sys; sys.stdout.reconfigure(encoding='utf-8'); z=zipfile.ZipFile(sys.argv[1]); print(z.read("${entry}").decode("utf-8"))`,
      path,
    ],
    { encoding: "utf8" },
  );
}

const sampleResume = {
  header: {
    name: "Chad Christopher Taylor",
    headline: "Lead AI Engineer",
    email: "jrtaylor91714@gmail.com",
    links: "https://www.linkedin.com/in/jr-taylor-50172558",
    phone: "+1 (972) 301-7727",
    location: "McKinney, Texas, USA",
  },
  sections: [
    {
      type: "summary",
      title: "Summary",
      items: [{ text: "Lead AI Engineer with 12+ years of experience designing AI systems." }],
    },
    {
      type: "experience",
      title: "Work Experience",
      items: [
        {
          role: "Lead AI Engineer",
          company: "Eagle Analytix",
          location: "Remote, USA",
          duration: "Feb 2024 - Apr 2026",
          project:
            "Led architecture for a Pricing Intelligence Platform when brokers needed automated analysis.",
          bullets: [{ text: "Defined reusable AI agent patterns for pricing workflows." }],
        },
      ],
    },
    {
      type: "skills",
      title: "Core Skills",
      items: [{ category: "Artificial Intelligence & ML", values: ["LLMs", "RAG Architecture"] }],
    },
    {
      type: "education",
      title: "Education",
      items: [
        {
          school: "Stanford University",
          duration: "2010 - 2014",
          degree: "Bachelor's Degree",
          field: "Computer Science",
          grade: "3.7",
        },
      ],
    },
  ],
};

function isZip(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b;
}

describe("docx style export", () => {
  it("normalizes chad-taylor aliases", () => {
    expect(normalizeDocxStyleId("chad-taylor")).toBe("chad-taylor");
    expect(normalizeDocxStyleId("professional-times")).toBe("chad-taylor");
    expect(normalizeDocxStyleId("chad-taylor-pdf")).toBe("chad-taylor-pdf");
    expect(normalizeDocxStyleId("roboto")).toBe("chad-taylor-pdf");
    expect(normalizeDocxStyleId("flowcv")).toBe("flowcv");
    expect(normalizeDocxStyleId("flowcv-source")).toBe("flowcv-source");
    expect(normalizeDocxStyleId("source-sans")).toBe("flowcv-source");
    expect(normalizeDocxStyleId("")).toBe("calibri");
  });

  it("builds calibri and chad-taylor DOCX buffers", async () => {
    const calibri = await exportOptimizedResumeToDocxBuffer(sampleResume, "calibri");
    const chad = await exportOptimizedResumeToDocxBuffer(sampleResume, "chad-taylor");
    const chadPdf = await exportOptimizedResumeToDocxBuffer(sampleResume, "chad-taylor-pdf");
    const flowcv = await exportOptimizedResumeToDocxBuffer(sampleResume, "flowcv");
    expect(isZip(calibri)).toBe(true);
    expect(isZip(chad)).toBe(true);
    expect(isZip(chadPdf)).toBe(true);
    expect(isZip(flowcv)).toBe(true);
    expect(chad.length).toBeGreaterThan(1000);
    expect(chadPdf.length).toBeGreaterThan(1000);
    expect(flowcv.length).toBeGreaterThan(1000);
    expect(calibri.equals(chad)).toBe(false);
    expect(calibri.equals(chadPdf)).toBe(false);
    expect(calibri.equals(flowcv)).toBe(false);
  });

  it("chad-taylor registers Word styles for collapse/expand", async () => {
    const chad = await exportOptimizedResumeToDocxBuffer(sampleResume, "chad-taylor");
    const stylesXml = readDocxXml(chad, "word/styles.xml");
    const documentXml = readDocxXml(chad, "word/document.xml");

    expect(stylesXml).toContain('w:styleId="Name"');
    expect(stylesXml).toContain('w:styleId="Label"');
    expect(stylesXml).toContain('w:styleId="Contact"');
    expect(stylesXml).toContain('w:styleId="Heading2"');
    expect(stylesXml).toMatch(/Heading2[\s\S]*w:outlineLvl w:val="1"/);

    expect(documentXml).toContain('w:pStyle w:val="Name"');
    expect(documentXml).toContain('w:pStyle w:val="Label"');
    expect(documentXml).toContain('w:pStyle w:val="Contact"');
    expect(documentXml).toContain('w:pStyle w:val="Heading2"');
    expect(documentXml).toContain('w:pStyle w:val="ListParagraph"');
  });

  it("chad-taylor-pdf uses Roboto layout from reference PDF", async () => {
    const buf = await exportOptimizedResumeToDocxBuffer(sampleResume, "chad-taylor-pdf");
    const documentXml = readDocxXml(buf, "word/document.xml");
    expect(documentXml).toContain("EXPERIENCE");
    expect(documentXml).toContain('w:val="1F4E79"');
    expect(documentXml).toContain('w:val="555555"');
    expect(documentXml).toContain("Roboto");
    expect(documentXml).toContain("Montserrat");
    expect(documentXml).toContain(" | ");
    expect(documentXml).not.toContain("Professional Experience");
  });

  it("flowcv uses FlowCV section titles and education-before-skills order", async () => {
    const buf = await exportOptimizedResumeToDocxBuffer(sampleResume, "flowcv");
    const documentXml = readDocxXml(buf, "word/document.xml");
    expect(documentXml).toContain("Professional Experience");
    expect(documentXml).toContain(">Skills<");
    expect(documentXml).not.toContain("Core Skills");
    const eduPos = documentXml.indexOf("Education");
    const skillsPos = documentXml.indexOf(">Skills<");
    expect(eduPos).toBeGreaterThan(-1);
    expect(skillsPos).toBeGreaterThan(eduPos);
  });

  it("flowcv uses an 83/17 experience column split for role vs dates", async () => {
    const buf = await exportOptimizedResumeToDocxBuffer(sampleResume, "flowcv");
    const documentXml = readDocxXml(buf, "word/document.xml");
    expect(documentXml).toContain('w:w="8856"');
    expect(documentXml).toContain('w:w="1944"');
    expect(documentXml).toContain('w:val="right"');
    expect(documentXml).toContain("Eagle Analytix");
  });

  it("flowcv includes section underlines, pipe-separated contact, and round bullets", async () => {
    const buf = await exportOptimizedResumeToDocxBuffer(sampleResume, "flowcv");
    const documentXml = readDocxXml(buf, "word/document.xml");
    const numberingXml = readDocxXml(buf, "word/numbering.xml");
    expect(documentXml).toContain('w:val="355C7D"');
    expect(documentXml).toContain("<w:bottom");
    expect(documentXml).toContain(" | ");
    expect(documentXml).not.toContain("wp:inline");
    expect(numberingXml).toMatch(/\u2022|&#x2022;/);
  });

  it("flowcv-source uses Source Sans Pro centered layout from reference PDF", async () => {
    const buf = await exportOptimizedResumeToDocxBuffer(sampleResume, "flowcv-source");
    const documentXml = readDocxXml(buf, "word/document.xml");
    expect(documentXml).toContain("Source Sans Pro");
    expect(documentXml).toContain('w:val="0E374E"');
    expect(documentXml).toContain('w:val="center"');
    expect(documentXml).toContain("PROFESSIONAL EXPERIENCE");
    expect(documentXml).toContain("Eagle Analytix");
    expect(documentXml).toContain("Remote,");
    expect(documentXml).toContain("02/2024");
    expect(documentXml).toContain("2010");
    expect(documentXml).toContain("2014");
    expect(documentXml).toContain(" | ");
    expect(documentXml).toContain('w:tab w:val="right"');
  });
});
