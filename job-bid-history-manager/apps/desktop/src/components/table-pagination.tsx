import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { TABLE_PAGE_SIZES } from "@jbhm/shared";
import { cn } from "@/lib/utils";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

const navBtn =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-none border border-input bg-background text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40";

const pageBtn =
  "inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-none border border-input bg-background px-2 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Page numbers on each side of current (window size = 2 * n + 1, current in the middle). */
const PAGE_SIBLINGS = 3;

function buildPageItems(current: number, total: number): Array<number | "ellipsis"> {
  if (total <= 0) return [];

  const windowSize = PAGE_SIBLINGS * 2 + 1;
  if (total <= windowSize + 2) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  let start = current - PAGE_SIBLINGS;
  let end = current + PAGE_SIBLINGS;

  // Keep a full centered window when near the first or last page
  if (end - start + 1 < windowSize) {
    if (start <= 1) {
      start = 1;
      end = Math.min(total, windowSize);
    } else if (end >= total) {
      end = total;
      start = Math.max(1, total - windowSize + 1);
    }
  }

  start = Math.max(1, start);
  end = Math.min(total, end);

  const items: Array<number | "ellipsis"> = [];

  if (start > 1) {
    items.push(1);
    if (start > 2) items.push("ellipsis");
  }

  for (let p = start; p <= end; p++) items.push(p);

  if (end < total) {
    if (end < total - 1) items.push("ellipsis");
    items.push(total);
  }

  return items;
}

export function TablePagination({ page, pageSize, total, onPageChange, onPageSizeChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);
  const pageItems = buildPageItems(safePage, totalPages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Rows per page</span>
        <select
          className="h-8 min-w-[4.5rem] rounded-md border border-input bg-background px-2 text-sm text-foreground"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          aria-label="Rows per page"
        >
          {TABLE_PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>

      <span className="text-xs text-muted-foreground">
        {total === 0 ? "No rows" : `${start}–${end} of ${total}`}
      </span>

      <nav className="flex items-center gap-0.5" aria-label="Table pagination">
        <button
          type="button"
          className={navBtn}
          disabled={safePage <= 1}
          onClick={() => onPageChange(1)}
          aria-label="First page"
          title="First page"
        >
          <ChevronFirst className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={navBtn}
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          aria-label="Previous page"
          title="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {pageItems.map((item, idx) =>
          item === "ellipsis" ? (
            <span
              key={`ellipsis-${idx}`}
              className="inline-flex h-8 min-w-8 items-center justify-center px-1 text-xs text-muted-foreground"
              aria-hidden
            >
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className={cn(
                pageBtn,
                item === safePage &&
                  "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
              )}
              onClick={() => onPageChange(item)}
              aria-label={`Page ${item}`}
              aria-current={item === safePage ? "page" : undefined}
            >
              {item}
            </button>
          ),
        )}

        <button
          type="button"
          className={navBtn}
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          aria-label="Next page"
          title="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={navBtn}
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(totalPages)}
          aria-label="Last page"
          title="Last page"
        >
          <ChevronLast className="h-4 w-4" />
        </button>
      </nav>
    </div>
  );
}
