"use client";

import dynamic from "next/dynamic";
import { FilterBar } from "@/components/jbhm/filter-bar";
import {
  emptyFilters,
  useDashboardFilters,
} from "@/components/dashboard/dashboard-filters-context";
import { useCapturedByUsersQuery, useTagsQuery } from "@/hooks/use-dashboard-queries";

const TagManagerDialog = dynamic(
  () =>
    import("@/components/jbhm/tag-manager-dialog").then((m) => ({
      default: m.TagManagerDialog,
    })),
  { ssr: false, loading: () => null },
);

type Props = {
  interactionHeld: boolean;
};

export function FiltersSection({ interactionHeld }: Props) {
  const { filters, setFilters, markFiltersCleared } = useDashboardFilters();
  const tagsQuery = useTagsQuery();
  const usersQuery = useCapturedByUsersQuery();

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <h2 className="text-sm font-semibold">Jobs & timeline</h2>
          <p className="text-xs text-muted-foreground">
            Table refreshes every 45s when this tab is visible
            {interactionHeld ? " · paused while you work" : ""}
          </p>
        </div>
        <TagManagerDialog tags={tagsQuery.data ?? []} />
      </div>

      <FilterBar
        filters={filters}
        allTags={tagsQuery.data ?? []}
        capturedByUsers={usersQuery.data ?? []}
        onChange={(next) =>
          setFilters((prev) => {
            const merged = { ...prev, ...next };
            const paginationOnly = Object.keys(next).every(
              (k) => k === "page" || k === "page_size",
            );
            if (!paginationOnly) merged.page = 1;
            return merged;
          })
        }
        onSearch={() => setFilters((prev) => ({ ...prev, page: 1 }))}
        onClear={() => {
          markFiltersCleared();
          setFilters(emptyFilters);
        }}
      />
    </>
  );
}
