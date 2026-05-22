import type { FilterState } from "@/components/jbhm/filter-bar";
import { COLUMN_LABELS } from "@/lib/jbhm/column-controls";
import type { JobSortField } from "@jbhm/shared";
import { toast } from "sonner";

export type LoadReason =
  | "initial"
  | "filter"
  | "poll"
  | "manual"
  | "mutation"
  | "page"
  | "save";

function describeActiveFilters(filters: FilterState): string {
  const parts: string[] = [];
  if (filters.captured_by) parts.push(`User: ${filters.captured_by}`);
  if (filters.tagNames?.length) {
    parts.push(
      filters.tagNames.length === 1
        ? `Tag: ${filters.tagNames[0]}`
        : `${filters.tagNames.length} tags`,
    );
  }
  if (filters.date_from || filters.date_to) {
    const from = filters.date_from ? filters.date_from.slice(0, 10) : "…";
    const to = filters.date_to ? filters.date_to.slice(0, 10) : "…";
    parts.push(`Dates: ${from} – ${to}`);
  }
  const search = filters.column_search ?? {};
  for (const [field, value] of Object.entries(search)) {
    if (value?.trim()) {
      const label = COLUMN_LABELS[field as JobSortField] ?? field;
      parts.push(`${label}: “${value.trim()}”`);
    }
  }
  const colIn = filters.column_in ?? {};
  for (const [field, values] of Object.entries(colIn)) {
    if (values?.length) {
      const label = COLUMN_LABELS[field as JobSortField] ?? field;
      parts.push(`${label}: ${values.length} selected`);
    }
  }
  const sort = filters.sort?.[0];
  if (sort) {
    const label = COLUMN_LABELS[sort.field] ?? sort.field;
    parts.push(`Sort: ${label} ${sort.dir}`);
  }
  return parts.length ? parts.join(" · ") : "No filters";
}

export function notifyAfterLoad(opts: {
  reason: LoadReason;
  filters: FilterState;
  total: number;
  page: number;
  newBoardBids?: number;
  cleared?: boolean;
}) {
  const { reason, filters, total, page, newBoardBids, cleared } = opts;

  if (reason === "initial" || reason === "save") return;

  if (reason === "poll" && newBoardBids && newBoardBids > 0) {
    toast.success(newBoardBids === 1 ? "1 new bid" : `${newBoardBids} new bids`, {
      description: "Someone captured a job on the shared board",
      duration: 5000,
    });
    return;
  }

  if (reason === "manual") {
    toast.info("Refreshed", {
      description: `${total} job${total === 1 ? "" : "s"} match current view`,
    });
    return;
  }

  if (reason === "mutation") {
    toast.success("Updated", { description: `${total} jobs in current view` });
    return;
  }

  if (reason === "filter" || cleared) {
    const title = cleared ? "Filters cleared" : "Filters applied";
    toast.info(title, {
      description: `${describeActiveFilters(filters)} · ${total} result${total === 1 ? "" : "s"}`,
    });
    return;
  }

  if (reason === "page") {
    toast.message(`Page ${page}`, {
      description: `${total} total · showing page ${page}`,
      duration: 2500,
    });
  }
}

export function notifyLoadError(message: string) {
  toast.error("Could not load data", { description: message, duration: 6000 });
}

export function notifyActionSuccess(title: string, description?: string) {
  toast.success(title, description ? { description } : undefined);
}
