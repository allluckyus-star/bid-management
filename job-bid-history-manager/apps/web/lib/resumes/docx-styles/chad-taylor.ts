import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Paragraph,
  TextRun,
} from "docx";

import type { OptimizedResume } from "@/lib/resumes/gpt-result-parse";
import {
  addTextWithBoldMarkers,
  addTextWithHighlights,
  bulletText,
  formatDuration,
  inchesToTwip,
  paragraphSpacing,
  ptToHalfPoints,
  sectionMap,
  sortSections,
  str,
  TOP_BOTTOM_MARGIN,
  SIDE_MARGIN,
  packDocxToBuffer,
} from "@/lib/resumes/docx-shared";

// Matches Chad Christopher Taylor reference DOCX (Times New Roman, right header, Heading2 sections).
const FONT = "Times New Roman";
const LINE_SPACING = 1.15;

const NAME_SIZE_PT = 20;
const HEADLINE_SIZE_PT = 12;
const HEADING_SIZE_PT = 12;
const BODY_SIZE_PT = 10;

const BULLET_LEFT_INDENT_INCH = 0.35;
const BULLET_HANGING_INCH = 0.15;

const STYLE_NAME = "Name";
const STYLE_LABEL = "Label";
const STYLE_CONTACT = "Contact";

function chadTaylorDocumentStyles() {
  return {
    default: {
      document: {
        run: {
          font: FONT,
          size: ptToHalfPoints(BODY_SIZE_PT),
          color: "000000",
        },
        paragraph: {
          spacing: paragraphSpacing({ lineSpacing: LINE_SPACING }),
        },
      },
      heading1: {
        run: {
          font: FONT,
          size: ptToHalfPoints(NAME_SIZE_PT),
          bold: true,
        },
        paragraph: {
          outlineLevel: 0,
        },
      },
      heading2: {
        run: {
          font: FONT,
          size: ptToHalfPoints(HEADING_SIZE_PT),
          bold: true,
        },
        paragraph: {
          outlineLevel: 1,
          keepNext: true,
          keepLines: true,
        },
      },
      heading3: {
        run: {
          font: FONT,
          size: ptToHalfPoints(HEADLINE_SIZE_PT),
        },
        paragraph: {
          outlineLevel: 2,
        },
      },
      listParagraph: {},
    },
    paragraphStyles: [
      {
        id: STYLE_NAME,
        name: "Name",
        basedOn: "Heading1",
        paragraph: {
          alignment: AlignmentType.RIGHT,
        },
      },
      {
        id: STYLE_LABEL,
        name: "Label",
        basedOn: "Heading3",
        paragraph: {
          alignment: AlignmentType.RIGHT,
        },
      },
      {
        id: STYLE_CONTACT,
        name: "Contact",
        paragraph: {
          alignment: AlignmentType.RIGHT,
        },
        run: {
          italics: true,
        },
      },
    ],
  };
}

/** Inherit font/size from paragraph style or document defaults (matches reference DOCX). */
function textRun(text: string, opts?: { bold?: boolean; italic?: boolean }) {
  return new TextRun({
    text: text || " ",
    color: "000000",
    bold: opts?.bold,
    italics: opts?.italic,
  });
}

function spacerParagraph(): Paragraph {
  return new Paragraph({
    spacing: paragraphSpacing({ lineSpacing: LINE_SPACING }),
    children: [textRun(" ")],
  });
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function contactLine(value: string): Paragraph {
  const text = str(value);
  const children: Array<TextRun | ExternalHyperlink> = [];

  if (isUrl(text)) {
    children.push(
      new ExternalHyperlink({
        link: text,
        children: [textRun(text)],
      }),
    );
  } else if (text.includes("@")) {
    children.push(
      new ExternalHyperlink({
        link: `mailto:${text}`,
        children: [textRun(text)],
      }),
    );
  } else {
    children.push(textRun(text));
  }

  return new Paragraph({
    style: STYLE_CONTACT,
    spacing: paragraphSpacing({ afterPt: 1, lineSpacing: LINE_SPACING }),
    children,
  });
}

function rightAlignedHeader(header: Record<string, unknown>): Paragraph[] {
  const name = str(header.name);
  const headline = str(header.headline);
  const email = str(header.email);
  const links = str(header.links)
    .split("|")
    .map((v) => str(v))
    .filter(Boolean);
  const phone = str(header.phone);
  const location = str(header.location);

  const out: Paragraph[] = [];

  if (name) {
    out.push(
      new Paragraph({
        style: STYLE_NAME,
        spacing: paragraphSpacing({ afterPt: 1, lineSpacing: LINE_SPACING }),
        children: [textRun(name)],
      }),
    );
  }
  if (headline) {
    out.push(
      new Paragraph({
        style: STYLE_LABEL,
        spacing: paragraphSpacing({ afterPt: 1, lineSpacing: LINE_SPACING }),
        children: [textRun(headline)],
      }),
    );
  }
  if (email) out.push(contactLine(email));
  for (const link of links) out.push(contactLine(link));

  const locationPhone = [location, phone].filter(Boolean).join(" | ");
  if (locationPhone) out.push(contactLine(locationPhone));

  return out;
}

function sectionHeading(title: string): Paragraph[] {
  const t = str(title);
  if (!t) return [];
  return [
    spacerParagraph(),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: paragraphSpacing({ beforePt: 2, afterPt: 2, lineSpacing: LINE_SPACING }),
      children: [textRun(t)],
    }),
    spacerParagraph(),
  ];
}

function renderSummary(section: Record<string, unknown> | undefined): Paragraph[] {
  if (!section) return [];
  const items = Array.isArray(section.items) ? section.items : [];
  const joined = items
    .map((i) => str((i as { text?: string }).text))
    .filter(Boolean)
    .join(" ");
  if (!joined) return [];
  return [
    spacerParagraph(),
    new Paragraph({
      spacing: paragraphSpacing({ afterPt: 2, lineSpacing: LINE_SPACING }),
      children: addTextWithBoldMarkers(joined, BODY_SIZE_PT, FONT, textRun),
    }),
    spacerParagraph(),
  ];
}

function roleDurationLine(role: string, duration: string): Paragraph | null {
  if (!role && !duration) return null;
  const children: TextRun[] = [];
  if (role) children.push(textRun(role, { bold: true }));
  if (duration) children.push(textRun(`${role ? "    " : ""}${formatDuration(duration)}`));
  return new Paragraph({
    spacing: paragraphSpacing({ afterPt: 1, lineSpacing: LINE_SPACING }),
    children,
  });
}

function companyLine(company: string, location: string): Paragraph | null {
  const text = [company, location].filter(Boolean).join(" | ");
  if (!text) return null;
  return new Paragraph({
    spacing: paragraphSpacing({ afterPt: 1, lineSpacing: LINE_SPACING }),
    children: [textRun(text, { italic: true })],
  });
}

function introParagraph(text: string): Paragraph | null {
  const t = str(text);
  if (!t) return null;
  return new Paragraph({
    spacing: paragraphSpacing({ afterPt: 1, lineSpacing: LINE_SPACING }),
    children: addTextWithBoldMarkers(t, BODY_SIZE_PT, FONT, textRun),
  });
}

function bulletParagraph(bullet: unknown): Paragraph | null {
  if (!bullet) return null;
  const isObj = typeof bullet === "object" && bullet !== null;
  const t = isObj ? bulletText(bullet) : str(bullet);
  if (!t) return null;
  const highlights = isObj ? (bullet as { highlights?: unknown }).highlights : undefined;
  return new Paragraph({
    style: "ListParagraph",
    bullet: { level: 0 },
    spacing: paragraphSpacing({ afterPt: 2, lineSpacing: LINE_SPACING }),
    indent: {
      left: inchesToTwip(BULLET_LEFT_INDENT_INCH),
      hanging: inchesToTwip(BULLET_HANGING_INCH),
    },
    children: addTextWithHighlights(t, highlights, BODY_SIZE_PT, FONT, textRun),
  });
}

function renderExperience(section: Record<string, unknown> | undefined): Paragraph[] {
  if (!section || !Array.isArray(section.items) || !section.items.length) return [];
  const items = section.items as Array<Record<string, unknown>>;
  const out: Paragraph[] = sectionHeading(str(section.title) || "Work Experience");

  items.forEach((row, index) => {
    const role = str(row.role);
    const company = str(row.company);
    const location = str(row.location);
    const duration = str(row.duration);
    const intro = str(row.intro ?? row.summary ?? row.project);

    const roleLine = roleDurationLine(role, duration);
    if (roleLine) out.push(roleLine);
    const meta = companyLine(company, location);
    if (meta) out.push(meta);

    if (intro) {
      out.push(spacerParagraph());
      const introPara = introParagraph(intro);
      if (introPara) out.push(introPara);
      out.push(spacerParagraph());
    }

    const bullets = Array.isArray(row.bullets) ? row.bullets : [];
    for (const b of bullets) {
      const p = bulletParagraph(b);
      if (p) out.push(p);
    }

    if (index < items.length - 1) out.push(spacerParagraph());
  });

  return out;
}

function renderSkills(section: Record<string, unknown> | undefined): Paragraph[] {
  if (!section || !Array.isArray(section.items) || !section.items.length) return [];
  const items = section.items as Array<Record<string, unknown>>;
  const out: Paragraph[] = sectionHeading(str(section.title) || "Core Skills");

  for (const item of items) {
    const row = item as Record<string, unknown>;
    const category = str(row.category);
    const values = Array.isArray(row.values) ? row.values.map((v) => str(v)).filter(Boolean) : [];
    if (!values.length) continue;
    const children: TextRun[] = [];
    if (category) children.push(textRun(`${category}: `, { bold: true }));
    children.push(textRun(values.join(", ")));
    out.push(
      new Paragraph({
        spacing: paragraphSpacing({ afterPt: 2, lineSpacing: LINE_SPACING }),
        children,
      }),
    );
  }

  return out;
}

function renderEducation(section: Record<string, unknown> | undefined): Paragraph[] {
  if (!section || !Array.isArray(section.items) || !section.items.length) return [];
  const items = section.items as Array<Record<string, unknown>>;
  const out: Paragraph[] = sectionHeading(str(section.title) || "Education");

  items.forEach((row, index) => {
    const degree = str(row.degree);
    const field = str(row.field);
    const school = str(row.school);
    const year = str(row.duration);
    const grade = str((row as { grade?: unknown; gpa?: unknown }).grade ?? (row as { gpa?: unknown }).gpa);

    out.push(
      new Paragraph({
        spacing: paragraphSpacing({ afterPt: 1, lineSpacing: LINE_SPACING }),
        children: [
          ...(school ? [textRun(school, { bold: true })] : []),
          ...(year ? [textRun(`${school ? "    " : ""}${formatDuration(year)}`)] : []),
        ].length
          ? [
              ...(school ? [textRun(school, { bold: true })] : []),
              ...(year ? [textRun(`${school ? "    " : ""}${formatDuration(year)}`)] : []),
            ]
          : [textRun(" ")],
      }),
    );

    out.push(
      new Paragraph({
        spacing: paragraphSpacing({ afterPt: 1, lineSpacing: LINE_SPACING }),
        children: [
          ...(degree ? [textRun(degree, { bold: true })] : []),
          ...(field ? [textRun(`${degree ? " " : ""}${field}`)] : []),
        ].length
          ? [
              ...(degree ? [textRun(degree, { bold: true })] : []),
              ...(field ? [textRun(`${degree ? " " : ""}${field}`)] : []),
            ]
          : [textRun(" ")],
      }),
    );

    if (grade) {
      const value = grade.toLowerCase().startsWith("gpa") ? grade : `GPA: ${grade}`;
      out.push(
        new Paragraph({
          spacing: paragraphSpacing({ afterPt: 2, lineSpacing: LINE_SPACING }),
          children: [textRun(value)],
        }),
      );
    }

    if (index < items.length - 1) out.push(spacerParagraph());
  });

  return out;
}

export async function exportChadTaylorResumeToDocxBuffer(optimized: OptimizedResume): Promise<Buffer> {
  const header = (optimized.header ?? {}) as Record<string, unknown>;
  const sections = sectionMap(optimized);
  const ordered = sortSections(sections);

  const children: Paragraph[] = [];
  children.push(...rightAlignedHeader(header));
  children.push(spacerParagraph());

  for (const section of ordered) {
    const type = str(section.type).toLowerCase();
    if (type === "summary") children.push(...renderSummary(section));
    if (type === "experience") children.push(...renderExperience(section));
    if (type === "skills") children.push(...renderSkills(section));
    if (type === "education") children.push(...renderEducation(section));
  }

  const doc = new Document({
    styles: chadTaylorDocumentStyles(),
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: TOP_BOTTOM_MARGIN,
              bottom: TOP_BOTTOM_MARGIN,
              left: SIDE_MARGIN,
              right: SIDE_MARGIN,
            },
          },
        },
        children: (children.length ? children : [new Paragraph({ children: [textRun(" ")] })]) as never[],
      },
    ],
  });

  return packDocxToBuffer(doc);
}
