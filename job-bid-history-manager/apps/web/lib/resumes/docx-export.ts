import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  ITableCellOptions,
  LineRuleType,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from "docx";

import type { OptimizedResume } from "@/lib/resumes/gpt-result-parse";

// Ported to match Resume-sender `docx_export.py` layout/spacing as closely as docx.js allows.
const STANDARD_FONT = "Calibri";

// Page + typography constants (Resume-sender).
const INCH = 1440; // twips
const SIDE_MARGIN = 0.75 * INCH;
const TOP_BOTTOM_MARGIN = 0.75 * INCH;
const LINE_SPACING = 1.1;

const NAME_SIZE_PT = 18;
const HEADLINE_SIZE_PT = 13;
const HEADING_SIZE_PT = 15;
const ROLE_SIZE_PT = 13;
const BODY_SIZE_PT = 11;
const SKILL_SIZE_PT = 11;
const CONTACT_SIZE_PT = 10.5;
const META_SIZE_PT = 10.5;

const SECTION_TOP_SPACE_PT = 14;
const SECTION_BOTTOM_SPACE_PT = 8;
const ROLE_TOP_SPACE_PT = 10;
const ROLE_BOTTOM_SPACE_PT = 3;
const BULLET_BOTTOM_SPACE_PT = 3;

const BULLET_LEFT_INDENT_INCH = 0.35;
const BULLET_HANGING_INCH = 0.15;

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function ptToHalfPoints(pt: number): number {
  // docx.js sizes are half-points.
  return Math.round(pt * 2);
}

function ptToTwip(pt: number): number {
  return Math.round(pt * 20);
}

function inchesToTwip(inches: number): number {
  return Math.round(inches * INCH);
}

function paragraphSpacing(opts?: {
  beforePt?: number;
  afterPt?: number;
  lineSpacing?: number;
}): { before?: number; after?: number; line?: number; lineRule?: (typeof LineRuleType)[keyof typeof LineRuleType] } {
  const before = typeof opts?.beforePt === "number" ? ptToTwip(opts.beforePt) : undefined;
  const after = typeof opts?.afterPt === "number" ? ptToTwip(opts.afterPt) : undefined;
  const line =
    typeof opts?.lineSpacing === "number" ? Math.round(opts.lineSpacing * 240) : undefined;
  return { before, after, line, lineRule: LineRuleType.AUTO };
}

const DATE_SEPARATOR_PATTERN = /\s*[-–—]\s*/;
const MONTH_LOOKUP: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};
const MONTH_NUMBER_TO_ABBR: Record<string, string> = {
  "01": "Jan",
  "02": "Feb",
  "03": "Mar",
  "04": "Apr",
  "05": "May",
  "06": "Jun",
  "07": "Jul",
  "08": "Aug",
  "09": "Sep",
  "10": "Oct",
  "11": "Nov",
  "12": "Dec",
};

function formatSingleDate(value: string): string {
  const text = str(value);
  if (!text) return "";
  if (text.toLowerCase() === "present") return "Present";

  const numeric = text.match(/^(0?[1-9]|1[0-2])\/(\d{2,4})$/);
  if (numeric) {
    const month = numeric[1];
    const year = numeric[2];
    const fullYear = year.length === 4 ? year : `20${year}`;
    const monthValue = String(Number(month)).padStart(2, "0");
    return `${MONTH_NUMBER_TO_ABBR[monthValue] || monthValue} ${fullYear}`;
  }

  const monthName = text.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (monthName) {
    const monthWord = monthName[1].toLowerCase();
    const year = monthName[2];
    const month = MONTH_LOOKUP[monthWord];
    if (month) return `${MONTH_NUMBER_TO_ABBR[month] || month} ${year}`;
  }

  if (/^\d{4}$/.test(text)) return text;
  return text;
}

function formatDuration(value: string): string {
  const text = str(value);
  if (!text) return "";
  const parts = text.split(DATE_SEPARATOR_PATTERN).filter(Boolean);
  if (parts.length === 1) return formatSingleDate(parts[0]);
  if (parts.length >= 2) return `${formatSingleDate(parts[0])} - ${formatSingleDate(parts[1])}`;
  return text;
}

const SECTION_RENDER_ORDER = ["summary", "experience", "skills", "education", "projects"] as const;

function sectionMap(resume: OptimizedResume): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const section of resume.sections ?? []) {
    const s = section as Record<string, unknown>;
    const key = str(s.type).toLowerCase();
    if (!key) continue;
    out[key] = s;
  }
  return out;
}

function sortSections(sections: Record<string, Record<string, unknown>>): Array<Record<string, unknown>> {
  const list = Object.values(sections);
  return list.sort((a, b) => {
    const at = str(a.type).toLowerCase();
    const bt = str(b.type).toLowerCase();
    const ai = SECTION_RENDER_ORDER.indexOf(at as (typeof SECTION_RENDER_ORDER)[number]);
    const bi = SECTION_RENDER_ORDER.indexOf(bt as (typeof SECTION_RENDER_ORDER)[number]);
    const av = ai === -1 ? 999 : ai;
    const bv = bi === -1 ? 999 : bi;
    return av - bv;
  });
}

function bulletText(bullet: unknown): string {
  if (typeof bullet === "string") return bullet;
  if (bullet && typeof bullet === "object") return str((bullet as { text?: string }).text);
  return "";
}

function textRun(text: string, opts?: { pt?: number; bold?: boolean; italic?: boolean }) {
  return new TextRun({
    text: text || "",
    font: STANDARD_FONT,
    size: ptToHalfPoints(opts?.pt ?? BODY_SIZE_PT),
    bold: opts?.bold,
    italics: opts?.italic,
    color: "000000",
  });
}

function addTextWithBoldMarkers(text: string, pt: number): TextRun[] {
  const parts = String(text || "").split(/(\*\*[^*]+?\*\*)/g);
  const runs: TextRun[] = [];
  for (const part of parts) {
    if (!part) continue;
    const isBold = part.startsWith("**") && part.endsWith("**");
    const value = isBold ? part.slice(2, -2) : part;
    if (!value) continue;
    runs.push(textRun(value, { pt, bold: isBold }));
  }
  return runs.length ? runs : [textRun(" ", { pt })];
}

function normalizeHighlights(highlights: unknown): string[] {
  if (!Array.isArray(highlights)) return [];
  const cleaned: string[] = [];
  for (const item of highlights) {
    const value = str(item);
    if (value && !cleaned.includes(value)) cleaned.push(value);
    if (cleaned.length >= 2) break;
  }
  return cleaned;
}

function addTextWithHighlights(text: string, highlights: unknown, pt: number): TextRun[] {
  const source = String(text || "");
  if (!source) return [textRun(" ", { pt })];
  const hs = normalizeHighlights(highlights);
  const spans: Array<[number, number]> = [];
  for (const h of hs) {
    const start = source.indexOf(h);
    if (start >= 0) spans.push([start, start + h.length]);
  }
  if (!spans.length) return addTextWithBoldMarkers(source, pt);
  spans.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of spans) {
    if (!merged.length || start >= merged[merged.length - 1][1]) merged.push([start, end]);
    else merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], end);
  }
  const runs: TextRun[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) runs.push(textRun(source.slice(cursor, start), { pt }));
    runs.push(textRun(source.slice(start, end), { pt, bold: true }));
    cursor = end;
  }
  if (cursor < source.length) runs.push(textRun(source.slice(cursor), { pt }));
  return runs.length ? runs : [textRun(" ", { pt })];
}

function noCellBorders(): ITableCellOptions["borders"] {
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  return { top: none, bottom: none, left: none, right: none };
}

function twoColumnHeader(header: Record<string, unknown>): Table | null {
  const name = str(header.name);
  const headline = str(header.headline);
  const contacts = [
    str(header.email),
    ...str(header.links)
      .split("|")
      .map((v) => str(v))
      .filter(Boolean),
    str(header.phone),
    str(header.location),
  ].filter(Boolean);

  if (!name && !headline && !contacts.length) return null;

  const leftChildren: Paragraph[] = [];
  if (name) {
    leftChildren.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: paragraphSpacing({ afterPt: 2, lineSpacing: LINE_SPACING }),
        children: [textRun(name, { pt: NAME_SIZE_PT, bold: true })],
      }),
    );
  }
  if (headline) {
    leftChildren.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: paragraphSpacing({ afterPt: 1, lineSpacing: LINE_SPACING }),
        children: [textRun(headline, { pt: HEADLINE_SIZE_PT })],
      }),
    );
  }

  const rightChildren: Paragraph[] = [];
  if (contacts.length) rightChildren.push(new Paragraph({ children: [textRun(" ", { pt: 1 })] }));
  for (const c of contacts) {
    rightChildren.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: paragraphSpacing({ afterPt: 1, lineSpacing: LINE_SPACING }),
        children: [textRun(c, { pt: CONTACT_SIZE_PT, italic: true })],
      }),
    );
  }

  const row = new TableRow({
    children: [
      new TableCell({
        width: { size: inchesToTwip(4.55), type: "dxa" },
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        borders: noCellBorders(),
        shading: { type: ShadingType.CLEAR, color: "FFFFFF", fill: "FFFFFF" },
        children: leftChildren.length ? leftChildren : [new Paragraph({ children: [textRun(" ", { pt: 1 })] })],
      }),
      new TableCell({
        width: { size: inchesToTwip(2.45), type: "dxa" },
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        borders: noCellBorders(),
        shading: { type: ShadingType.CLEAR, color: "FFFFFF", fill: "FFFFFF" },
        children: rightChildren.length ? rightChildren : [new Paragraph({ children: [textRun(" ", { pt: 1 })] })],
      }),
    ],
  });

  return new Table({
    width: { size: inchesToTwip(7.0), type: "dxa" },
    rows: [row],
  });
}

function headerGap(): Paragraph {
  return new Paragraph({
    spacing: paragraphSpacing({ afterPt: 12, lineSpacing: LINE_SPACING }),
    children: [textRun(" ", { pt: 1 })],
  });
}

function sectionHeading(title: string, opts?: { beforePt?: number; afterPt?: number }): Paragraph {
  return new Paragraph({
    spacing: paragraphSpacing({
      beforePt: opts?.beforePt ?? SECTION_TOP_SPACE_PT,
      afterPt: Math.max(opts?.afterPt ?? 6, SECTION_BOTTOM_SPACE_PT),
      lineSpacing: LINE_SPACING,
    }),
    children: [
      new TextRun({
        text: str(title) || " ",
        font: STANDARD_FONT,
        size: ptToHalfPoints(HEADING_SIZE_PT),
        bold: true,
        color: "1F1F1F",
      }),
    ],
  });
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
    new Paragraph({
      spacing: paragraphSpacing({ beforePt: 8, afterPt: 10, lineSpacing: LINE_SPACING }),
      children: addTextWithBoldMarkers(joined, BODY_SIZE_PT),
    }),
  ];
}

function roleDurationLine(role: string, duration: string, opts?: { beforePt?: number }): Paragraph | null {
  if (!role && !duration) return null;
  const children: TextRun[] = [];
  if (role) children.push(textRun(role, { pt: ROLE_SIZE_PT, bold: true }));
  if (duration) children.push(textRun(`${role ? "    " : ""}${formatDuration(duration)}`, { pt: ROLE_SIZE_PT }));
  return new Paragraph({
    spacing: paragraphSpacing({
      beforePt: Math.max(opts?.beforePt ?? ROLE_TOP_SPACE_PT, ROLE_TOP_SPACE_PT),
      afterPt: ROLE_BOTTOM_SPACE_PT,
      lineSpacing: LINE_SPACING,
    }),
    children,
  });
}

function metaLine(text: string): Paragraph | null {
  const t = str(text);
  if (!t) return null;
  return new Paragraph({
    spacing: paragraphSpacing({ beforePt: 1, afterPt: 3, lineSpacing: LINE_SPACING }),
    children: [textRun(t, { pt: META_SIZE_PT, italic: true })],
  });
}

function bulletParagraph(bullet: unknown): Paragraph | null {
  if (!bullet) return null;
  const isObj = typeof bullet === "object" && bullet !== null;
  const t = isObj ? str((bullet as { text?: string }).text) : str(bullet);
  if (!t) return null;
  const highlights = isObj ? (bullet as { highlights?: unknown }).highlights : undefined;
  return new Paragraph({
    bullet: { level: 0 },
    spacing: paragraphSpacing({ afterPt: BULLET_BOTTOM_SPACE_PT, lineSpacing: LINE_SPACING }),
    indent: {
      left: inchesToTwip(BULLET_LEFT_INDENT_INCH),
      hanging: inchesToTwip(BULLET_HANGING_INCH),
    },
    children: addTextWithHighlights(t, highlights, BODY_SIZE_PT),
  });
}

const PROJECT_LABEL_SIZE_PT = 10.5;

function projectLine(project: string): Paragraph | null {
  const t = str(project);
  if (!t) return null;
  return new Paragraph({
    spacing: paragraphSpacing({ beforePt: 2, afterPt: 4, lineSpacing: LINE_SPACING }),
    children: [
      textRun("Project: ", { pt: PROJECT_LABEL_SIZE_PT, bold: true }),
      textRun(t, { pt: PROJECT_LABEL_SIZE_PT }),
    ],
  });
}

function renderExperience(section: Record<string, unknown> | undefined): Paragraph[] {
  if (!section || !Array.isArray(section.items) || !section.items.length) return [];
  const items = section.items as Array<Record<string, unknown>>;
  const out: Paragraph[] = [sectionHeading(str(section.title) || "Experience", { beforePt: 14 })];
  for (const item of items) {
    const row = item as Record<string, unknown>;
    const role = str(row.role);
    const company = str(row.company);
    const location = str(row.location);
    const duration = str(row.duration);
    const project = str(row.project);
    const roleLine = roleDurationLine(role, duration);
    if (roleLine) out.push(roleLine);
    const meta = metaLine([company, location].filter(Boolean).join(" | "));
    if (meta) out.push(meta);
    const proj = projectLine(project);
    if (proj) out.push(proj);
    const bullets = Array.isArray(row.bullets) ? row.bullets : [];
    for (const b of bullets) {
      const p = bulletParagraph(b);
      if (p) out.push(p);
    }
  }
  return out;
}

function renderSkills(section: Record<string, unknown> | undefined): Paragraph[] {
  if (!section || !Array.isArray(section.items) || !section.items.length) return [];
  const items = section.items as Array<Record<string, unknown>>;
  const out: Paragraph[] = [sectionHeading(str(section.title) || "Skills", { beforePt: 14 })];
  for (const item of items) {
    const row = item as Record<string, unknown>;
    const category = str(row.category);
    const values = Array.isArray(row.values) ? row.values.map((v) => str(v)).filter(Boolean) : [];
    if (!values.length) continue;
    const children: TextRun[] = [];
    if (category) children.push(textRun(`${category}: `, { pt: SKILL_SIZE_PT, bold: true }));
    children.push(textRun(values.join(", "), { pt: SKILL_SIZE_PT }));
    out.push(
      new Paragraph({
        spacing: paragraphSpacing({ afterPt: 3, lineSpacing: LINE_SPACING }),
        children,
      }),
    );
  }
  return out;
}

function renderEducation(section: Record<string, unknown> | undefined): Paragraph[] {
  if (!section || !Array.isArray(section.items) || !section.items.length) return [];
  const items = section.items as Array<Record<string, unknown>>;
  const out: Paragraph[] = [sectionHeading(str(section.title) || "Education", { beforePt: 14 })];

  items.forEach((row, index) => {
    const degree = str(row.degree);
    const field = str(row.field);
    const school = str(row.school);
    const year = str(row.duration);
    const grade = str((row as { grade?: unknown; gpa?: unknown }).grade ?? (row as { gpa?: unknown }).gpa);

    out.push(
      new Paragraph({
        spacing: paragraphSpacing({ beforePt: index > 0 ? 8 : 0, afterPt: 1, lineSpacing: LINE_SPACING }),
        children: [
          ...(school ? [textRun(school, { pt: BODY_SIZE_PT, bold: true })] : []),
          ...(year ? [textRun(`${school ? "    " : ""}${formatDuration(year)}`, { pt: BODY_SIZE_PT })] : []),
        ].length
          ? [
              ...(school ? [textRun(school, { pt: BODY_SIZE_PT, bold: true })] : []),
              ...(year ? [textRun(`${school ? "    " : ""}${formatDuration(year)}`, { pt: BODY_SIZE_PT })] : []),
            ]
          : [textRun(" ", { pt: BODY_SIZE_PT })],
      }),
    );

    out.push(
      new Paragraph({
        spacing: paragraphSpacing({ afterPt: 1, lineSpacing: LINE_SPACING }),
        children: [
          ...(degree ? [textRun(degree, { pt: BODY_SIZE_PT, bold: true })] : []),
          ...(field ? [textRun(`${degree ? " " : ""}${field}`, { pt: BODY_SIZE_PT })] : []),
        ].length
          ? [
              ...(degree ? [textRun(degree, { pt: BODY_SIZE_PT, bold: true })] : []),
              ...(field ? [textRun(`${degree ? " " : ""}${field}`, { pt: BODY_SIZE_PT })] : []),
            ]
          : [textRun(" ", { pt: BODY_SIZE_PT })],
      }),
    );

    if (grade) {
      const value = grade.toLowerCase().startsWith("gpa") ? grade : `GPA: ${grade}`;
      out.push(
        new Paragraph({
          spacing: paragraphSpacing({ afterPt: 2, lineSpacing: LINE_SPACING }),
          children: [textRun(value, { pt: BODY_SIZE_PT })],
        }),
      );
    }
  });

  return out;
}

export async function exportOptimizedResumeToDocxBuffer(
  optimized: OptimizedResume,
): Promise<Buffer> {
  const header = (optimized.header ?? {}) as Record<string, unknown>;
  const sections = sectionMap(optimized);
  const ordered = sortSections(sections);

  const children: Array<Paragraph | Table> = [];
  const headerTable = twoColumnHeader(header);
  if (headerTable) children.push(headerTable);
  children.push(headerGap());

  for (const section of ordered) {
    const type = str(section.type).toLowerCase();
    if (type === "summary") children.push(...renderSummary(section));
    if (type === "experience") children.push(...renderExperience(section));
    if (type === "skills") children.push(...renderSkills(section));
    if (type === "education") children.push(...renderEducation(section));
    // Projects not rendered in Resume-sender export_to_docx() (even though helpers exist).
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: STANDARD_FONT,
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
              left: SIDE_MARGIN,
              right: SIDE_MARGIN,
            },
          },
        },
        children: (children.length ? children : [new Paragraph({ children: [textRun(" ", { pt: 1 })] })]) as any,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
