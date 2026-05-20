/** Strip control chars for safe display (not HTML execution). */
export function sanitizeDisplayText(text: string): string {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}
