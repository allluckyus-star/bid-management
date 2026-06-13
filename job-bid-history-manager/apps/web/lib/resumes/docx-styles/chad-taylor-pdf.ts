import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  LevelFormat,
  Paragraph,
  TabStopType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
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
  str,
  TOP_BOTTOM_MARGIN,
  packDocxToBuffer,
} from "@/lib/resumes/docx-shared";

// Matches chad-taylor.pdf (Montserrat headings, Roboto body, blue accent, pipe contact row).
const FONT_BODY = "Roboto";
const FONT_HEADING = "Montserrat";
const ACCENT = "1F4E79";
const BODY_COLOR = "555555";
const BULLET_COLOR = "4468B1";
const LINE_SPACING = 1.15;

const NAME_SIZE_PT = 22;
const HEADING_SIZE_PT = 11;
const BODY_SIZE_PT = 10;

const SIDE_MARGIN_PDF = inchesToTwip(0.585);
const CONTENT_WIDTH = inchesToTwip(7.33);
const RIGHT_TAB_POSITION = inchesToTwip(6.988);
const EXPERIENCE_LEFT_COL = inchesToTwip(6.0);
const EXPERIENCE_RIGHT_COL = inchesToTwip(1.33);
const CONTACT_SPLIT = " | ";

const BULLET_LEFT_INDENT_INCH = 0.25;
const BULLET_HANGING_INCH = 0.18;
const BULLET_REF = "chad-taylor-pdf-bullet";

const SECTION_ORDER = ["summary", "experience", "skills", "education"] as const;

const SECTION_LINE_BORDER = {
  style: BorderStyle.SINGLE,
  size: 6,
  color: ACCENT,
};

function pdfSectionTitle(type: string, fallback: string): string {
  const key = str(type).toLowerCase();
  if (key === "experience") return "EXPERIENCE";
  if (key === "skills") return "SKILLS";
  if (key === "education") return "EDUCATION";
  if (key === "summary") return "SUMMARY";
  return str(fallback).toUpperCase() || fallback;
}

function sortSections(sections: Record<string, Record<string, unknown>>): Array<Record<string, unknown>> {
  return Object.values(sections).sort((a, b) => {
    const at = str(a.type).toLowerCase();
    const bt = str(b.type).toLowerCase();
    const ai = SECTION_ORDER.indexOf(at as (typeof SECTION_ORDER)[number]);
    const bi = SECTION_ORDER.indexOf(bt as (typeof SECTION_ORDER)[number]);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

function bodyRun(
  text: string,
  opts?: { bold?: boolean; italic?: boolean; color?: string; pt?: number },
): TextRun {
  return new TextRun({
    text: text || " ",
    font: FONT_BODY,
    size: ptToHalfPoints(opts?.pt ?? BODY_SIZE_PT),
    color: opts?.color ?? BODY_COLOR,
    bold: opts?.bold,
    italics: opts?.italic,
  });
}

function headingRun(text: string, opts?: { pt?: number }): TextRun {
  return new TextRun({
    text: text || " ",
    font: FONT_HEADING,
    size: ptToHalfPoints(opts?.pt ?? HEADING_SIZE_PT),
    color: ACCENT,
    bold: true,
  });
}

function singleLineDuration(value: string): string {
  return formatDuration(value).replace(/ /g, "\u00A0");
}

function displayLinkText(value: string): string {
  return str(value)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "");
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function normalizeLink(value: string): string {
  const t = str(value);
  if (!t) return "";
  if (isUrl(t)) return t;
  if (t.includes("linkedin.com")) return t.startsWith("http") ? t : `https://${t}`;
  return t;
}

function contactTextRun(value: string): TextRun | ExternalHyperlink {
  const text = str(value);
  if (text.includes("@")) {
    return new ExternalHyperlink({
      link: `mailto:${text}`,
      children: [bodyRun(text)],
    });
  }
  const url = normalizeLink(text);
  if (url.startsWith("http") || url.includes("linkedin.com")) {
    const href = url.startsWith("http") ? url : `https://${url}`;
    return new ExternalHyperlink({
      link: href,
      children: [bodyRun(displayLinkText(text))],
    });
  }
  return bodyRun(text);
}

function contactLineRuns(values: string[]): Array<TextRun | ExternalHyperlink> {
  const children: Array<TextRun | ExternalHyperlink> = [];
  values.forEach((value, index) => {
    if (index > 0) children.push(bodyRun(CONTACT_SPLIT));
    children.push(contactTextRun(value));
  });
  return children;
}

function leftHeader(header: Record<string, unknown>): Paragraph[] {
  const name = str(header.name);
  const email = str(header.email);
  const phone = str(header.phone);
  const location = str(header.location);
  const links = str(header.links)
    .split("|")
    .map((v) => str(v))
    .filter(Boolean);

  const out: Paragraph[] = [];

  if (name) {
    out.push(
      new Paragraph({
        spacing: paragraphSpacing({ afterPt: 6, lineSpacing: LINE_SPACING }),
        children: [headingRun(name, { pt: NAME_SIZE_PT })],
      }),
    );
  }

  const contactRow = [location, phone, email, ...links].filter(Boolean);
  if (contactRow.length) {
    out.push(
      new Paragraph({
        spacing: paragraphSpacing({ afterPt: 8, lineSpacing: LINE_SPACING }),
        children: contactLineRuns(contactRow),
      }),
    );
  }

  return out;
}

function accentHeading(title: string): Table {
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [CONTENT_WIDTH],
    borders: noBorders(),
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: {
              top: none,
              left: none,
              right: none,
              bottom: SECTION_LINE_BORDER,
            },
            margins: { top: 0, bottom: 40, left: 0, right: 0 },
            children: [
              new Paragraph({
                spacing: paragraphSpacing({ beforePt: 10, afterPt: 4, lineSpacing: LINE_SPACING }),
                children: [headingRun(str(title).toUpperCase() || " ")],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function spacerParagraph(afterPt = 4): Paragraph {
  return new Paragraph({
    spacing: paragraphSpacing({ afterPt, lineSpacing: LINE_SPACING }),
    children: [bodyRun(" ")],
  });
}

function renderSummary(section: Record<string, unknown> | undefined): Array<Paragraph | Table> {
  if (!section) return [];
  const items = Array.isArray(section.items) ? section.items : [];
  const joined = items
    .map((i) => str((i as { text?: string }).text))
    .filter(Boolean)
    .join(" ");
  if (!joined) return [];

  return [
    new Paragraph({
      spacing: paragraphSpacing({ afterPt: 10, lineSpacing: LINE_SPACING }),
      children: addTextWithBoldMarkers(joined, BODY_SIZE_PT, FONT_BODY, (t, o) =>
        bodyRun(t, { bold: o?.bold, italic: o?.italic }),
      ),
    }),
  ];
}

function experienceRoleParagraph(role: string): Paragraph {
  return new Paragraph({
    spacing: paragraphSpacing({ beforePt: 6, afterPt: 2, lineSpacing: LINE_SPACING }),
    children: role ? [bodyRun(role, { bold: true })] : [bodyRun(" ")],
  });
}

function experienceMetaParagraph(text: string, opts?: { beforePt?: number }): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    keepLines: true,
    wordWrap: false,
    spacing: paragraphSpacing({
      beforePt: opts?.beforePt ?? 0,
      afterPt: 2,
      lineSpacing: LINE_SPACING,
    }),
    children: [bodyRun(singleLineDuration(text))],
  });
}

function experienceCompanyParagraph(company: string, location: string): Paragraph | null {
  const text = [company, location].filter(Boolean).join(", ");
  if (!text) return null;
  return new Paragraph({
    spacing: paragraphSpacing({ afterPt: 4, lineSpacing: LINE_SPACING }),
    children: [bodyRun(text)],
  });
}

function experienceEntryCell(children: Paragraph[], width: number): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: noBorders(),
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    children: children.length ? children : [spacerParagraph(0)],
  });
}

function experienceEntryTable(item: Record<string, unknown>): Array<Paragraph | Table> {
  const role = str(item.role);
  const company = str(item.company);
  const location = str(item.location);
  const duration = str(item.duration);
  const bullets = Array.isArray(item.bullets) ? item.bullets : [];
  const bulletParas = bullets.map((b) => bulletParagraph(b)).filter(Boolean) as Paragraph[];

  const out: Array<Paragraph | Table> = [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [EXPERIENCE_LEFT_COL, EXPERIENCE_RIGHT_COL],
      borders: noBorders(),
      rows: [
        new TableRow({
          children: [
            experienceEntryCell([experienceRoleParagraph(role)], EXPERIENCE_LEFT_COL),
            experienceEntryCell(
              duration ? [experienceMetaParagraph(duration, { beforePt: 6 })] : [spacerParagraph(0)],
              EXPERIENCE_RIGHT_COL,
            ),
          ],
        }),
      ],
    }),
  ];

  const companyLine = experienceCompanyParagraph(company, location);
  if (companyLine) out.push(companyLine);
  out.push(...bulletParas);
  out.push(spacerParagraph(6));
  return out;
}

function bulletParagraph(bullet: unknown): Paragraph | null {
  if (!bullet) return null;
  const isObj = typeof bullet === "object" && bullet !== null;
  const t = isObj ? bulletText(bullet) : str(bullet);
  if (!t) return null;
  const highlights = isObj ? (bullet as { highlights?: unknown }).highlights : undefined;
  return new Paragraph({
    numbering: { reference: BULLET_REF, level: 0 },
    spacing: paragraphSpacing({ afterPt: 2, lineSpacing: LINE_SPACING }),
    children: addTextWithHighlights(t, highlights, BODY_SIZE_PT, FONT_BODY, (text, o) =>
      bodyRun(text, { bold: o?.bold, italic: o?.italic }),
    ),
  });
}

function renderExperience(section: Record<string, unknown> | undefined): Array<Paragraph | Table> {
  if (!section || !Array.isArray(section.items) || !section.items.length) return [];
  const out: Array<Paragraph | Table> = [
    accentHeading(pdfSectionTitle("experience", str(section.title) || "Experience")),
  ];
  for (const item of section.items as Array<Record<string, unknown>>) {
    out.push(...experienceEntryTable(item));
  }
  return out;
}

function skillsCategoryParagraph(category: string, values: string[]): Paragraph | null {
  if (!category && !values.length) return null;
  const label = category ? `${category}: ` : "";
  const tail = values.join(", ");
  const children: TextRun[] = [];
  if (label) children.push(bodyRun(label, { bold: true }));
  if (tail) children.push(bodyRun(tail));
  return new Paragraph({
    numbering: { reference: BULLET_REF, level: 0 },
    spacing: paragraphSpacing({ afterPt: 2, lineSpacing: LINE_SPACING }),
    children: children.length ? children : [bodyRun(" ")],
  });
}

function renderSkills(section: Record<string, unknown> | undefined): Array<Paragraph | Table> {
  if (!section || !Array.isArray(section.items) || !section.items.length) return [];
  const items = section.items as Array<Record<string, unknown>>;
  const out: Array<Paragraph | Table> = [
    accentHeading(pdfSectionTitle("skills", str(section.title) || "Skills")),
  ];
  for (const item of items) {
    const row = item as Record<string, unknown>;
    const p = skillsCategoryParagraph(
      str(row.category),
      Array.isArray(row.values) ? row.values.map((v) => str(v)).filter(Boolean) : [],
    );
    if (p) out.push(p);
  }
  out.push(spacerParagraph(4));
  return out;
}

function renderEducation(section: Record<string, unknown> | undefined): Array<Paragraph | Table> {
  if (!section || !Array.isArray(section.items) || !section.items.length) return [];
  const items = section.items as Array<Record<string, unknown>>;
  const out: Array<Paragraph | Table> = [
    accentHeading(pdfSectionTitle("education", str(section.title) || "Education")),
  ];

  for (const item of items) {
    const row = item as Record<string, unknown>;
    const degree = str(row.degree);
    const field = str(row.field);
    const school = str(row.school);
    const year = str(row.duration);
    const grade = str((row as { grade?: unknown; gpa?: unknown }).grade ?? (row as { gpa?: unknown }).gpa);

    const degreeField = [degree, field].filter(Boolean).join(", ");
    const degreeChildren: TextRun[] = [];
    if (degreeField) degreeChildren.push(bodyRun(degreeField, { bold: true }));
    if (year) {
      if (degreeChildren.length) degreeChildren.push(new TextRun({ text: "\t" }));
      degreeChildren.push(bodyRun(singleLineDuration(year)));
    }

    out.push(
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB_POSITION }],
        spacing: paragraphSpacing({ beforePt: 4, afterPt: 2, lineSpacing: LINE_SPACING }),
        children: degreeChildren.length ? degreeChildren : [bodyRun(" ")],
      }),
    );

    if (school) {
      out.push(
        new Paragraph({
          spacing: paragraphSpacing({ afterPt: 2, lineSpacing: LINE_SPACING }),
          children: [bodyRun(school)],
        }),
      );
    }

    if (grade) {
      const value = grade.toLowerCase().startsWith("gpa") ? grade : `GPA: ${grade}`;
      out.push(
        new Paragraph({
          spacing: paragraphSpacing({ afterPt: 6, lineSpacing: LINE_SPACING }),
          children: [bodyRun(value)],
        }),
      );
    }
  }

  return out;
}

function noBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  return {
    top: none,
    bottom: none,
    left: none,
    right: none,
    insideHorizontal: none,
    insideVertical: none,
  };
}

export async function exportChadTaylorPdfResumeToDocxBuffer(optimized: OptimizedResume): Promise<Buffer> {
  const header = (optimized.header ?? {}) as Record<string, unknown>;
  const sections = sectionMap(optimized);
  const ordered = sortSections(sections);

  const children: Array<Paragraph | Table> = [];
  children.push(...leftHeader(header));

  for (const section of ordered) {
    const type = str(section.type).toLowerCase();
    if (type === "summary") children.push(...renderSummary(section));
    if (type === "experience") children.push(...renderExperience(section));
    if (type === "skills") children.push(...renderSkills(section));
    if (type === "education") children.push(...renderEducation(section));
  }

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: BULLET_REF,
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "\u25CF",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: {
                    left: inchesToTwip(BULLET_LEFT_INDENT_INCH + BULLET_HANGING_INCH),
                    hanging: inchesToTwip(BULLET_HANGING_INCH),
                  },
                },
                run: {
                  font: FONT_BODY,
                  size: ptToHalfPoints(9),
                  color: BULLET_COLOR,
                },
              },
            },
          ],
        },
      ],
    },
    styles: {
      default: {
        document: {
          run: {
            font: FONT_BODY,
            size: ptToHalfPoints(BODY_SIZE_PT),
            color: BODY_COLOR,
          },
          paragraph: {
            spacing: paragraphSpacing({ lineSpacing: LINE_SPACING }),
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: TOP_BOTTOM_MARGIN,
              bottom: TOP_BOTTOM_MARGIN,
              left: SIDE_MARGIN_PDF,
              right: SIDE_MARGIN_PDF,
            },
          },
        },
        children: (children.length ? children : [new Paragraph({ children: [bodyRun(" ")] })]) as never[],
      },
    ],
  });

  return packDocxToBuffer(doc);
}
