import {
  AlignmentType,
  BorderStyle,
  Document,
  ITableCellOptions,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from "docx";

import type { OptimizedResume } from "@/lib/resumes/gpt-result-parse";
import {
  addTextWithBoldMarkers,
  addTextWithHighlights,
  formatDuration,
  inchesToTwip,
  packDocxToBuffer,
  paragraphSpacing,
  ptToHalfPoints,
  sectionMap,
  sortSections,
  str,
  TOP_BOTTOM_MARGIN,
  SIDE_MARGIN,
} from "@/lib/resumes/docx-shared";

// Ported to match Resume-sender `docx_export.py` layout/spacing as closely as docx.js allows.
const STANDARD_FONT = "Calibri";

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
      children: addTextWithBoldMarkers(joined, BODY_SIZE_PT, STANDARD_FONT, textRun),
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
    children: addTextWithHighlights(t, highlights, BODY_SIZE_PT, STANDARD_FONT, textRun),
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

export async function exportCalibriResumeToDocxBuffer(optimized: OptimizedResume): Promise<Buffer> {
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
        children: (children.length ? children : [new Paragraph({ children: [textRun(" ", { pt: 1 })] })]) as never[],
      },
    ],
  });

  return packDocxToBuffer(doc);
}
