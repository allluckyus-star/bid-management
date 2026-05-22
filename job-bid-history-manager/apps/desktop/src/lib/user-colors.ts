/** Stable colors per captured_by — same name always maps to the same color. */

export const USER_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#a855f7",
  "#f59e0b",
  "#ec4899",
  "#06b6d4",
  "#eab308",
  "#f97316",
] as const;

export function sortedUserNames(names: Iterable<string>): string[] {
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function colorForUser(capturedBy: string, allUsers?: string[]): string {
  const roster = allUsers?.length ? allUsers : [capturedBy];
  const sorted = sortedUserNames(roster);
  const idx = sorted.indexOf(capturedBy);
  const slot = idx >= 0 ? idx : 0;
  return USER_COLORS[slot % USER_COLORS.length];
}

export function userColorMap(names: Iterable<string>): Map<string, string> {
  const sorted = sortedUserNames(names);
  return new Map(sorted.map((name, i) => [name, USER_COLORS[i % USER_COLORS.length]]));
}

export function userMarkerHtml(color: string): string {
  return `<span style="display:inline-block;margin-right:5px;border-radius:2px;width:10px;height:10px;background-color:${color};"></span>`;
}
