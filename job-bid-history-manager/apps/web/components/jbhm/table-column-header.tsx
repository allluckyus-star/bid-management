import type { JobFilterableField, JobOrderableField, JobSortField } from "@jbhm/shared";
import { ArrowDown, ArrowDownUp, ArrowUp, Filter, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { COLUMN_CONTROLS, COLUMN_LABELS } from "@/lib/jbhm/column-controls";

type Props = {
  field?: JobSortField;
  label?: string;
  filterActive?: boolean;
  searchActive?: boolean;
  sortDir?: "asc" | "desc" | null;
  onFilterClick?: () => void;
  onSortClick?: () => void;
  onSearchClick?: () => void;
};

const btnClass =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-none border border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground";

export function TableColumnHeader({
  field,
  label,
  filterActive,
  searchActive,
  sortDir = null,
  onFilterClick,
  onSortClick,
  onSearchClick,
}: Props) {
  const title = label ?? (field ? COLUMN_LABELS[field] : "");
  const cfg = field ? COLUMN_CONTROLS[field] : null;
  const SortIcon =
    sortDir === "asc" ? ArrowUp : sortDir === "desc" ? ArrowDown : ArrowDownUp;
  const sortTitle =
    sortDir === "asc"
      ? "Sorted ascending (click for descending)"
      : sortDir === "desc"
        ? "Sorted descending (click to clear)"
        : "Sort ascending (click)";

  return (
    <div className="flex min-w-[100px] flex-col items-center gap-1 text-center">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </span>
      <div className="flex items-center justify-center gap-0.5">
        {cfg?.sort && onSortClick && (
          <button
            type="button"
            className={cn(
              btnClass,
              sortDir && "border-primary bg-primary/10 text-primary",
            )}
            onClick={onSortClick}
            aria-label={`Sort ${title}`}
            title={sortTitle}
          >
            <SortIcon className="h-3.5 w-3.5" />
          </button>
        )}
        {cfg?.filter && onFilterClick && (
          <button
            type="button"
            className={cn(btnClass, filterActive && "border-primary bg-primary/10 text-primary")}
            onClick={onFilterClick}
            aria-label={`Filter ${title}`}
            title="Filter by values"
          >
            <Filter className="h-3.5 w-3.5" />
          </button>
        )}
        {cfg?.search && onSearchClick && (
          <button
            type="button"
            className={cn(btnClass, searchActive && "border-primary bg-primary/10 text-primary")}
            onClick={onSearchClick}
            aria-label={`Search ${title}`}
            title="Search this column"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export type { JobFilterableField, JobOrderableField };
