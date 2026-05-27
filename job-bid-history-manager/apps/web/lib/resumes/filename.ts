/** Sanitize filename segments for resume export downloads. */

export function cleanString(value: string): string {
  return String(value ?? "")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .split(/\s+/)
    .join(" ")
    .trim();
}

export function sanitizeFilenameSegment(value: string, maxLen = 88): string {
  let raw = cleanString(value);
  raw = raw.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
  raw = raw.replace(/\s+/g, " ").trim();
  if (!raw) return "";
  return raw.slice(0, maxLen);
}

export function buildExportFilename(params: {
  userName: string;
  companyName: string;
  jobTitle: string;
}): string {
  const namePart = sanitizeFilenameSegment(params.userName) || "Resume";
  const company = sanitizeFilenameSegment(params.companyName);
  const role = sanitizeFilenameSegment(params.jobTitle);
  const inner = [company, role].filter(Boolean).join(" - ");
  if (!inner) {
    throw new Error("Company name and role are required for export filename");
  }
  return `${namePart}(${inner}).docx`;
}
