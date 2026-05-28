import type { FilterState } from "@/components/jbhm/filter-bar";

export const emptyFilters: FilterState = {
  tagNames: [],
  column_search: {},
  column_in: {},
  sort: [{ field: "captured_at", dir: "desc" }],
  captured_by: undefined,
  date_from: undefined,
  date_to: undefined,
  page: 1,
  page_size: 10,
};

const STORAGE_PREFIX = "jbhm-dashboard-filters";

function storageKey(teamId: string) {
  return `${STORAGE_PREFIX}:${teamId}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Restore filters from localStorage (per team). */
export function loadPersistedFilters(teamId: string): FilterState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(teamId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    return {
      ...emptyFilters,
      ...parsed,
      tagNames: Array.isArray(parsed.tagNames)
        ? (parsed.tagNames as string[]).filter((t) => typeof t === "string")
        : [],
      column_search: isRecord(parsed.column_search)
        ? (parsed.column_search as FilterState["column_search"])
        : {},
      column_in: isRecord(parsed.column_in)
        ? (parsed.column_in as FilterState["column_in"])
        : {},
      sort: Array.isArray(parsed.sort) ? (parsed.sort as FilterState["sort"]) : emptyFilters.sort,
      page: typeof parsed.page === "number" ? parsed.page : emptyFilters.page,
      page_size: typeof parsed.page_size === "number" ? parsed.page_size : emptyFilters.page_size,
      captured_by: typeof parsed.captured_by === "string" ? parsed.captured_by : undefined,
      date_from: typeof parsed.date_from === "string" ? parsed.date_from : undefined,
      date_to: typeof parsed.date_to === "string" ? parsed.date_to : undefined,
    };
  } catch {
    return null;
  }
}

export function savePersistedFilters(teamId: string, filters: FilterState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(teamId), JSON.stringify(filters));
  } catch {
    /* ignore quota */
  }
}
