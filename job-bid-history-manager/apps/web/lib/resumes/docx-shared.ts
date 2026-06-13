import { LineRuleType, Packer, TextRun, type File as DocxFile } from "docx";

/** Pack a docx Document using arraybuffer output (works in browser + Node). */
export async function packDocxToBuffer(doc: DocxFile): Promise<Buffer> {
  const arrayBuffer = await Packer.toArrayBuffer(doc);
  return Buffer.from(new Uint8Array(arrayBuffer));
}

export const INCH = 1440; // twips
export const SIDE_MARGIN = 0.75 * INCH;
export const TOP_BOTTOM_MARGIN = 0.75 * INCH;

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

export function str(v: unknown): string {
  return String(v ?? "").trim();
}

export function ptToHalfPoints(pt: number): number {
  return Math.round(pt * 2);
}

export function ptToTwip(pt: number): number {
  return Math.round(pt * 20);
}

export function inchesToTwip(inches: number): number {
  return Math.round(inches * INCH);
}

export function paragraphSpacing(opts?: {
  beforePt?: number;
  afterPt?: number;
  lineSpacing?: number;
}): {
  before?: number;
  after?: number;
  line?: number;
  lineRule?: (typeof LineRuleType)[keyof typeof LineRuleType];
} {
  const before = typeof opts?.beforePt === "number" ? ptToTwip(opts.beforePt) : undefined;
  const after = typeof opts?.afterPt === "number" ? ptToTwip(opts.afterPt) : undefined;
  const line =
    typeof opts?.lineSpacing === "number" ? Math.round(opts.lineSpacing * 240) : undefined;
  return { before, after, line, lineRule: LineRuleType.AUTO };
}

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

export function formatDuration(value: string): string {
  const text = str(value);
  if (!text) return "";
  const parts = text.split(DATE_SEPARATOR_PATTERN).filter(Boolean);
  if (parts.length === 1) return formatSingleDate(parts[0]);
  if (parts.length >= 2) return `${formatSingleDate(parts[0])} - ${formatSingleDate(parts[1])}`;
  return text;
}

export const SECTION_RENDER_ORDER = ["summary", "experience", "skills", "education", "projects"] as const;

export function sectionMap(resume: { sections?: unknown[] }): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const section of resume.sections ?? []) {
    const s = section as Record<string, unknown>;
    const key = str(s.type).toLowerCase();
    if (!key) continue;
    out[key] = s;
  }
  return out;
}

export function sortSections(
  sections: Record<string, Record<string, unknown>>,
): Array<Record<string, unknown>> {
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

export function bulletText(bullet: unknown): string {
  if (typeof bullet === "string") return bullet;
  if (bullet && typeof bullet === "object") return str((bullet as { text?: string }).text);
  return "";
}

export function normalizeHighlights(highlights: unknown): string[] {
  if (!Array.isArray(highlights)) return [];
  const cleaned: string[] = [];
  for (const item of highlights) {
    const value = str(item);
    if (value && !cleaned.includes(value)) cleaned.push(value);
    if (cleaned.length >= 2) break;
  }
  return cleaned;
}

export function addTextWithBoldMarkers(
  text: string,
  pt: number,
  font: string,
  textRun: (text: string, opts?: { pt?: number; bold?: boolean; italic?: boolean }) => TextRun,
): TextRun[] {
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

export function addTextWithHighlights(
  text: string,
  highlights: unknown,
  pt: number,
  font: string,
  textRun: (text: string, opts?: { pt?: number; bold?: boolean; italic?: boolean }) => TextRun,
): TextRun[] {
  const source = String(text || "");
  if (!source) return [textRun(" ", { pt })];
  const hs = normalizeHighlights(highlights);
  const spans: Array<[number, number]> = [];
  for (const h of hs) {
    const start = source.indexOf(h);
    if (start >= 0) spans.push([start, start + h.length]);
  }
  if (!spans.length) return addTextWithBoldMarkers(source, pt, font, textRun);
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
