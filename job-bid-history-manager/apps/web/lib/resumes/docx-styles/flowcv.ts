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
  VerticalAlignTable,
  WidthType,
} from "docx";

import type { OptimizedResume } from "@/lib/resumes/gpt-result-parse";
import {
  addTextWithBoldMarkers,
  addTextWithHighlights,
  bulletText,
  inchesToTwip,
  paragraphSpacing,
  ptToHalfPoints,
  sectionMap,
  str,
  TOP_BOTTOM_MARGIN,
  packDocxToBuffer,
} from "@/lib/resumes/docx-shared";

// FlowCV export (Open Sans, accent headings, left header, right-aligned dates, 2-column skills).
const FONT = "Open Sans";
const ACCENT = "355C7D";
const LINE_SPACING = 1.25;

const NAME_SIZE_PT = 21;
const TITLE_SIZE_PT = 13.5;
const HEADING_SIZE_PT = 12;
const BODY_SIZE_PT = 10;

const SIDE_MARGIN_FLOWCV = inchesToTwip(0.46875);
const CONTENT_WIDTH_INCH = 7.5625;
const RIGHT_TAB_POSITION = inchesToTwip(CONTENT_WIDTH_INCH);
const SKILLS_COL_WIDTH = inchesToTwip(CONTENT_WIDTH_INCH / 2);
const CONTENT_WIDTH = inchesToTwip(CONTENT_WIDTH_INCH);
const CONTACT_SPLIT = " | ";
const EXPERIENCE_LEFT_WIDTH_INCH = 6.15;
const EXPERIENCE_RIGHT_WIDTH_INCH = 1.35;
const EXPERIENCE_LEFT_COL = inchesToTwip(EXPERIENCE_LEFT_WIDTH_INCH);
const EXPERIENCE_RIGHT_COL = inchesToTwip(EXPERIENCE_RIGHT_WIDTH_INCH);

const BULLET_LEFT_INDENT_INCH = 0.05;
const BULLET_HANGING_INCH = 0.18;

const FLOWCV_SECTION_ORDER = ["summary", "experience", "education", "skills"] as const;
const FLOWCV_BULLET_REF = "flowcv-round-bullet";

const SECTION_LINE_BORDER = {
  style: BorderStyle.SINGLE,
  size: 12,
  color: ACCENT,
};

const DATE_SEPARATOR_PATTERN = /\s*[-–—]\s*/;
const MONTH_LOOKUP: Record<string, string> = {
  jan: "01", january: "01", feb: "02", february: "02", mar: "03", march: "03",
  apr: "04", april: "04", may: "05", jun: "06", june: "06", jul: "07", july: "07",
  aug: "08", august: "08", sep: "09", sept: "09", september: "09", oct: "10", october: "10",
  nov: "11", november: "11", dec: "12", december: "12",
};

function formatFlowCvSingleDate(value: string): string {
  const text = str(value);
  if (!text) return "";
  if (text.toLowerCase() === "present") return "Present";

  const numeric = text.match(/^(0?[1-9]|1[0-2])\/(\d{2,4})$/);
  if (numeric) {
    const month = String(Number(numeric[1])).padStart(2, "0");
    const year = numeric[2].length === 4 ? numeric[2] : `20${numeric[2]}`;
    return `${month}/${year}`;
  }

  const monthName = text.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (monthName) {
    const month = MONTH_LOOKUP[monthName[1].toLowerCase()];
    if (month) return `${month}/${monthName[2]}`;
  }

  if (/^\d{4}$/.test(text)) return text;
  return text;
}

function formatFlowCvDuration(value: string): string {
  const text = str(value);
  if (!text) return "";
  const parts = text.split(DATE_SEPARATOR_PATTERN).filter(Boolean);
  if (parts.length === 1) return formatFlowCvSingleDate(parts[0]);
  if (parts.length >= 2) {
    const start = formatFlowCvSingleDate(parts[0]);
    const end = formatFlowCvSingleDate(parts[1]);
    return `${start}\u00A0–\u00A0${end}`;
  }
  return text.replace(/ /g, "\u00A0");
}

function textRun(
  text: string,
  opts?: { pt?: number; bold?: boolean; italic?: boolean; color?: string; inherit?: boolean },
) {
  return new TextRun({
    text: text || " ",
    color: opts?.color ?? "000000",
    bold: opts?.bold,
    italics: opts?.italic,
    ...(opts?.inherit
      ? {}
      : { font: FONT, size: ptToHalfPoints(opts?.pt ?? BODY_SIZE_PT) }),
  });
}

function sortFlowCvSections(sections: Record<string, Record<string, unknown>>): Array<Record<string, unknown>> {
  const list = Object.values(sections);
  return list.sort((a, b) => {
    const at = str(a.type).toLowerCase();
    const bt = str(b.type).toLowerCase();
    const ai = FLOWCV_SECTION_ORDER.indexOf(at as (typeof FLOWCV_SECTION_ORDER)[number]);
    const bi = FLOWCV_SECTION_ORDER.indexOf(bt as (typeof FLOWCV_SECTION_ORDER)[number]);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

function flowCvSectionTitle(type: string, fallback: string): string {
  const key = str(type).toLowerCase();
  if (key === "experience") return "Professional Experience";
  if (key === "skills") return "Skills";
  if (key === "education") return "Education";
  if (key === "summary") return "Summary";
  return str(fallback) || fallback;
}

function displayLinkText(value: string): string {
  return str(value)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "");
}

function contactTextRun(value: string): TextRun | ExternalHyperlink {
  const text = str(value);
  if (text.includes("@")) {
    return new ExternalHyperlink({
      link: `mailto:${text}`,
      children: [textRun(text)],
    });
  }
  const url = normalizeLink(text);
  if (url.startsWith("http") || url.includes("linkedin.com")) {
    const href = url.startsWith("http") ? url : `https://${url}`;
    return new ExternalHyperlink({
      link: href,
      children: [textRun(displayLinkText(text))],
    });
  }
  return textRun(text);
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
            margins: { top: 0, bottom: 48, left: 0, right: 0 },
            children: [
              new Paragraph({
                spacing: paragraphSpacing({ beforePt: 12, afterPt: 4, lineSpacing: LINE_SPACING }),
                children: [textRun(str(title) || " ", { pt: HEADING_SIZE_PT, bold: true, color: ACCENT })],
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
    children: [textRun(" ")],
  });
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

function contactSeparatorRun(): TextRun {
  return textRun(CONTACT_SPLIT);
}

function contactLineRuns(values: string[]): Array<TextRun | ExternalHyperlink> {
  const children: Array<TextRun | ExternalHyperlink> = [];
  values.forEach((value, index) => {
    if (index > 0) children.push(contactSeparatorRun());
    children.push(contactTextRun(value));
  });
  return children;
}

function leftHeader(header: Record<string, unknown>): Paragraph[] {
  const name = str(header.name);
  const headline = str(header.headline);
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
        spacing: paragraphSpacing({ afterPt: 4, lineSpacing: LINE_SPACING }),
        children: [textRun(name, { pt: NAME_SIZE_PT, bold: true, color: ACCENT })],
      }),
    );
  }
  if (headline) {
    out.push(
      new Paragraph({
        spacing: paragraphSpacing({ afterPt: 10, lineSpacing: LINE_SPACING }),
        children: [textRun(headline, { pt: TITLE_SIZE_PT, color: ACCENT })],
      }),
    );
  }

  const contactRow = [email, phone, location, ...links].filter(Boolean);
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

function renderSummary(section: Record<string, unknown> | undefined): Array<Paragraph | Table> {
  if (!section) return [];
  const items = Array.isArray(section.items) ? section.items : [];
  const joined = items
    .map((i) => str((i as { text?: string }).text))
    .filter(Boolean)
    .join(" ");
  if (!joined) return [];

  return [
    accentHeading(flowCvSectionTitle("summary", str(section.title) || "Summary")),
    new Paragraph({
      spacing: paragraphSpacing({ afterPt: 8, lineSpacing: LINE_SPACING }),
      children: addTextWithBoldMarkers(joined, BODY_SIZE_PT, FONT, (t, o) =>
        textRun(t, { bold: o?.bold, italic: o?.italic }),
      ),
    }),
  ];
}

function experienceRoleParagraph(role: string, company: string): Paragraph {
  const children: TextRun[] = [];
  if (role) children.push(textRun(role, { bold: true }));
  if (company) {
    if (role) children.push(textRun(", ", { bold: true }));
    children.push(textRun(company, { italic: true }));
  }
  return new Paragraph({
    spacing: paragraphSpacing({ beforePt: 6, afterPt: 2, lineSpacing: LINE_SPACING }),
    children: children.length ? children : [textRun(" ")],
  });
}

function experienceMetaParagraph(text: string, opts?: { beforePt?: number; afterPt?: number }): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    keepLines: true,
    wordWrap: false,
    spacing: paragraphSpacing({
      beforePt: opts?.beforePt ?? 0,
      afterPt: opts?.afterPt ?? 2,
      lineSpacing: LINE_SPACING,
    }),
    children: [textRun(text.replace(/ /g, "\u00A0"))],
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

function experienceEntryTable(item: Record<string, unknown>): Table {
  const role = str(item.role);
  const company = str(item.company);
  const location = str(item.location);
  const duration = str(item.duration);
  const bullets = Array.isArray(item.bullets) ? item.bullets : [];
  const bulletParas = bullets.map((b) => bulletParagraph(b)).filter(Boolean) as Paragraph[];

  const rows: TableRow[] = [
    new TableRow({
      children: [
        experienceEntryCell([experienceRoleParagraph(role, company)], EXPERIENCE_LEFT_COL),
        experienceEntryCell(
          duration ? [experienceMetaParagraph(formatFlowCvDuration(duration), { beforePt: 6 })] : [spacerParagraph(0)],
          EXPERIENCE_RIGHT_COL,
        ),
      ],
    }),
  ];

  if (bulletParas.length === 0) {
    if (location) {
      rows.push(
        new TableRow({
          children: [
            experienceEntryCell([spacerParagraph(0)], EXPERIENCE_LEFT_COL),
            experienceEntryCell([experienceMetaParagraph(location)], EXPERIENCE_RIGHT_COL),
          ],
        }),
      );
    }
  } else {
    bulletParas.forEach((bullet, index) => {
      const rowChildren: TableCell[] = [experienceEntryCell([bullet], EXPERIENCE_LEFT_COL)];
      if (index === 0) {
        rowChildren.push(
          new TableCell({
            rowSpan: bulletParas.length,
            verticalAlign: VerticalAlignTable.TOP,
            width: { size: EXPERIENCE_RIGHT_COL, type: WidthType.DXA },
            borders: noBorders(),
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: location ? [experienceMetaParagraph(location, { afterPt: 4 })] : [spacerParagraph(0)],
          }),
        );
      }
      rows.push(new TableRow({ children: rowChildren }));
    });
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [EXPERIENCE_LEFT_COL, EXPERIENCE_RIGHT_COL],
    borders: noBorders(),
    rows,
  });
}

function bulletParagraph(bullet: unknown): Paragraph | null {
  if (!bullet) return null;
  const isObj = typeof bullet === "object" && bullet !== null;
  const t = isObj ? bulletText(bullet) : str(bullet);
  if (!t) return null;
  const highlights = isObj ? (bullet as { highlights?: unknown }).highlights : undefined;
  return new Paragraph({
    numbering: { reference: FLOWCV_BULLET_REF, level: 0 },
    spacing: paragraphSpacing({ afterPt: 2, lineSpacing: LINE_SPACING }),
    children: addTextWithHighlights(t, highlights, BODY_SIZE_PT, FONT, (text, o) =>
      textRun(text, { bold: o?.bold, italic: o?.italic }),
    ),
  });
}

function renderExperience(section: Record<string, unknown> | undefined): Array<Paragraph | Table> {
  if (!section || !Array.isArray(section.items) || !section.items.length) return [];
  const items = section.items as Array<Record<string, unknown>>;
  const out: Array<Paragraph | Table> = [
    accentHeading(flowCvSectionTitle("experience", str(section.title) || "Professional Experience")),
  ];

  for (const item of items) {
    out.push(experienceEntryTable(item as Record<string, unknown>));
    out.push(spacerParagraph(6));
  }

  return out;
}

function renderEducation(section: Record<string, unknown> | undefined): Array<Paragraph | Table> {
  if (!section || !Array.isArray(section.items) || !section.items.length) return [];
  const items = section.items as Array<Record<string, unknown>>;
  const out: Array<Paragraph | Table> = [accentHeading(flowCvSectionTitle("education", str(section.title) || "Education"))];

  for (const item of items) {
    const row = item as Record<string, unknown>;
    const degree = str(row.degree);
    const field = str(row.field);
    const school = str(row.school);
    const year = str(row.duration);
    const grade = str((row as { grade?: unknown; gpa?: unknown }).grade ?? (row as { gpa?: unknown }).gpa);

    const degreeField = [degree, field].filter(Boolean).join(" ");
    const children: TextRun[] = [];
    if (degreeField) children.push(textRun(degreeField, { bold: true }));
    if (school) {
      if (degreeField) children.push(textRun(", ", { bold: true }));
      children.push(textRun(school, { italic: true }));
    }
    if (year) {
      if (children.length) children.push(new TextRun({ text: "\t" }));
      children.push(textRun(formatFlowCvDuration(year)));
    }

    out.push(
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB_POSITION }],
        spacing: paragraphSpacing({ beforePt: 4, afterPt: 2, lineSpacing: LINE_SPACING }),
        children: children.length ? children : [textRun(" ")],
      }),
    );

    if (grade) {
      const value = grade.toLowerCase().startsWith("gpa") ? grade : `GPA: ${grade}`;
      out.push(
        new Paragraph({
          spacing: paragraphSpacing({ afterPt: 6, lineSpacing: LINE_SPACING }),
          children: [textRun(value)],
        }),
      );
    }
  }

  return out;
}

function skillsCategoryBlock(category: string, values: string[]): Paragraph[] {
  if (!values.length) return [];
  const out: Paragraph[] = [];
  if (category) {
    out.push(
      new Paragraph({
        spacing: paragraphSpacing({ afterPt: 2, lineSpacing: LINE_SPACING }),
        children: [textRun(category, { bold: true })],
      }),
    );
  }
  out.push(
    new Paragraph({
      spacing: paragraphSpacing({ afterPt: 8, lineSpacing: LINE_SPACING }),
      children: [textRun(values.join(", "))],
    }),
  );
  return out;
}

function renderSkills(section: Record<string, unknown> | undefined): Array<Paragraph | Table> {
  if (!section || !Array.isArray(section.items) || !section.items.length) return [];
  const items = section.items as Array<Record<string, unknown>>;
  const out: Array<Paragraph | Table> = [accentHeading(flowCvSectionTitle("skills", str(section.title) || "Skills"))];

  const leftChildren: Paragraph[] = [];
  const rightChildren: Paragraph[] = [];
  items.forEach((item, index) => {
    const row = item as Record<string, unknown>;
    const block = skillsCategoryBlock(
      str(row.category),
      Array.isArray(row.values) ? row.values.map((v) => str(v)).filter(Boolean) : [],
    );
    if (index % 2 === 0) leftChildren.push(...block);
    else rightChildren.push(...block);
  });

  out.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: noBorders(),
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: SKILLS_COL_WIDTH, type: WidthType.DXA },
              borders: noBorders(),
              margins: { top: 0, bottom: 0, left: 0, right: inchesToTwip(0.14) },
              children: leftChildren.length ? leftChildren : [spacerParagraph(0)],
            }),
            new TableCell({
              width: { size: SKILLS_COL_WIDTH, type: WidthType.DXA },
              borders: noBorders(),
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
              children: rightChildren.length ? rightChildren : [spacerParagraph(0)],
            }),
          ],
        }),
      ],
    }),
  );

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

export async function exportFlowCvResumeToDocxBuffer(optimized: OptimizedResume): Promise<Buffer> {
  const header = (optimized.header ?? {}) as Record<string, unknown>;
  const sections = sectionMap(optimized);
  const ordered = sortFlowCvSections(sections);

  const children: Array<Paragraph | Table> = [];
  children.push(...leftHeader(header));
  children.push(spacerParagraph(6));

  for (const section of ordered) {
    const type = str(section.type).toLowerCase();
    if (type === "summary") children.push(...renderSummary(section));
    if (type === "experience") children.push(...renderExperience(section));
    if (type === "education") children.push(...renderEducation(section));
    if (type === "skills") children.push(...renderSkills(section));
  }

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: FLOWCV_BULLET_REF,
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "\u2022",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: {
                    left: inchesToTwip(BULLET_LEFT_INDENT_INCH + BULLET_HANGING_INCH),
                    hanging: inchesToTwip(BULLET_HANGING_INCH),
                  },
                },
                run: {
                  font: FONT,
                  size: ptToHalfPoints(6),
                  color: "000000",
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
            font: FONT,
            size: ptToHalfPoints(BODY_SIZE_PT),
            color: "000000",
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
              left: SIDE_MARGIN_FLOWCV,
              right: SIDE_MARGIN_FLOWCV,
            },
          },
        },
        children: (children.length ? children : [new Paragraph({ children: [textRun(" ")] })]) as never[],
      },
    ],
  });

  return packDocxToBuffer(doc);
}
