export const ALLOWED_TAG_NAMES = [
  "remote",
  "onsite",
  "hybrid",
  "full-time",
  "part-time",
] as const;

export const DEFAULT_TAG_COLORS: Record<string, string> = {
  remote: "#06b6d4",
  onsite: "#8b5cf6",
  hybrid: "#0ea5e9",
  "full-time": "#22c55e",
  "part-time": "#f59e0b",
};
