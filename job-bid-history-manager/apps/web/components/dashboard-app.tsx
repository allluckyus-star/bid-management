"use client";

import type {
  DashboardSummary,
  JobColumnSearch,
  JobColumnSelections,
  JobFilterableField,
  JobFilters,
  JobListItem,
  JobSortEntry,
  JobSortField,
  Tag,
} from "@jbhm/shared";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { RowSelectionState } from "@tanstack/react-table";
import { motion } from "framer-motion";
import { Moon, Puzzle, RefreshCw, Sun, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInteractionHold } from "@/hooks/use-interaction-hold";
import { DashboardCards } from "@/components/jbhm/dashboard-cards";
import { FilterBar, type FilterState } from "@/components/jbhm/filter-bar";
import { JobsTable } from "@/components/jbhm/jobs-table";
import { TablePagination } from "@/components/jbhm/table-pagination";
import { TagManagerDialog } from "@/components/jbhm/tag-manager-dialog";
import { TimelineChart } from "@/components/jbhm/timeline-chart";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import {
  bulkDeleteJobs,
  fetchCapturedByUsers,
  fetchDashboard,
  fetchJobs,
  fetchTags,
} from "@/lib/api/client";
import {
  notifyActionSuccess,
  notifyAfterLoad,
  notifyLoadError,
  type LoadReason,
} from "@/lib/jbhm/notify";

const DATA_POLL_INTERVAL_MS = 20_000;

const emptyFilters: FilterState = {
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

export function DashboardApp() {
  const [dark, setDark] = useState(false);
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [capturedByUsers, setCapturedByUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [refreshTick, setRefreshTick] = useState(0);
  const {
    held: interactionHeld,
    setHold: setInteractionHold,
    queueSilentRefresh,
    consumePendingSilent,
    isHeld: isInteractionHeld,
  } = useInteractionHold();
  const loadRef = useRef<typeof load | null>(null);
  const boardTotalRef = useRef<number | null>(null);
  const notifyMetaRef = useRef<{ cleared?: boolean }>({});
  const filterKeyRef = useRef<string>("");
  const pageKeyRef = useRef<string>("");
  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const debouncedSearch = useDebouncedValue(filters.column_search ?? {}, 350);

  const listContext = useMemo<JobFilters>(
    () => ({
      tags: filters.tagNames.length ? filters.tagNames : undefined,
      captured_by: filters.captured_by,
      date_from: filters.date_from,
      date_to: filters.date_to,
      column_search: debouncedSearch,
      column_in: filters.column_in,
    }),
    [
      filters.tagNames,
      filters.captured_by,
      filters.date_from,
      filters.date_to,
      filters.column_in,
      debouncedSearch,
    ],
  );

  const apiFilters = useMemo(
    () => ({
      ...listContext,
      sort: filters.sort?.length
        ? filters.sort
        : [{ field: "captured_at" as const, dir: "desc" as const }],
      page: filters.page ?? 1,
      page_size: filters.page_size ?? 10,
    }),
    [listContext, filters.sort, filters.page, filters.page_size],
  );

  const handleColumnSearchChange = (field: JobSortField, value: string) => {
    setFilters((prev) => {
      const column_search: JobColumnSearch = { ...prev.column_search };
      if (value.trim()) column_search[field] = value;
      else delete column_search[field];
      return { ...prev, column_search, page: 1 };
    });
  };

  const handleColumnInChange = (field: JobFilterableField, values: string[] | undefined) => {
    setFilters((prev) => {
      const column_in: JobColumnSelections = { ...prev.column_in };
      if (values?.length) column_in[field] = values;
      else delete column_in[field];
      return { ...prev, column_in, page: 1 };
    });
  };

  const handleSortChange = (sort: JobSortEntry[]) => {
    setFilters((prev) => ({ ...prev, sort, page: 1 }));
  };

  const filterKey = useMemo(
    () => JSON.stringify({ listContext, sort: filters.sort }),
    [listContext, filters.sort],
  );
  const pageKey = useMemo(
    () => `${filters.page ?? 1}-${filters.page_size ?? 10}`,
    [filters.page, filters.page_size],
  );

  const load = useCallback(
    async (options?: { silent?: boolean; reason?: LoadReason }) => {
      const silent = options?.silent ?? false;
      const reason = options?.reason ?? "filter";
      if (silent && isInteractionHeld()) {
        queueSilentRefresh();
        return;
      }
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const [jobsRes, dashboard, tags, users] = await Promise.all([
          fetchJobs(apiFilters),
          fetchDashboard(),
          fetchTags(),
          fetchCapturedByUsers(),
        ]);
        const prevBoardTotal = boardTotalRef.current;
        boardTotalRef.current = dashboard.total_bids;

        setJobs(jobsRes.items);
        setTotal(jobsRes.total);
        setSummary(dashboard);
        setAllTags(tags);
        setCapturedByUsers(users);
        if (!silent) setRowSelection({});
        if (silent) setError(null);
        setRefreshTick((t) => t + 1);

        const newBoardBids =
          reason === "poll" &&
          prevBoardTotal != null &&
          dashboard.total_bids > prevBoardTotal
            ? dashboard.total_bids - prevBoardTotal
            : 0;

        notifyAfterLoad({
          reason,
          filters,
          total: jobsRes.total,
          page: filters.page ?? 1,
          newBoardBids,
          cleared: notifyMetaRef.current.cleared,
        });
        notifyMetaRef.current = {};
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load data";
        setError(msg);
        notifyLoadError(msg);
        notifyMetaRef.current = {};
        if (!silent) {
          setJobs([]);
          setTotal(0);
          setSummary(null);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [apiFilters, filters, isInteractionHeld, queueSilentRefresh],
  );

  loadRef.current = load;

  const refreshJobsTable = useCallback(() => {
    void load({ silent: true, reason: "save" });
  }, [load]);

  useEffect(() => {
    let reason: LoadReason = "filter";
    if (isFirstLoadRef.current) {
      reason = "initial";
      isFirstLoadRef.current = false;
    } else if (filterKey !== filterKeyRef.current) {
      reason = "filter";
    } else if (pageKey !== pageKeyRef.current) {
      reason = "page";
    }
    filterKeyRef.current = filterKey;
    pageKeyRef.current = pageKey;
    void loadRef.current?.({ silent: false, reason });
  }, [filterKey, pageKey]);

  useEffect(() => {
    const id = window.setInterval(
      () => void loadRef.current?.({ silent: true, reason: "poll" }),
      DATA_POLL_INTERVAL_MS,
    );
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (interactionHeld) return;
    if (!consumePendingSilent()) return;
    void loadRef.current?.({ silent: true, reason: "poll" });
  }, [interactionHeld, consumePendingSilent]);

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return;
    if (!confirm(`Soft-delete ${selectedIds.length} selected job(s)?`)) return;
    setDeleting(true);
    try {
      await bulkDeleteJobs(selectedIds);
      notifyActionSuccess(
        `Deleted ${selectedIds.length} job${selectedIds.length === 1 ? "" : "s"}`,
      );
      await load({ silent: true, reason: "save" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bulk delete failed";
      setError(msg);
      notifyLoadError(msg);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Job Bid History Manager</h1>
            <p className="text-sm text-muted-foreground">Shared team board</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/extension">
                <Puzzle className="mr-1 h-4 w-4" />
                Extension
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load({ reason: "manual" })}
              disabled={loading}
            >
              <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setDark((d) => !d)}>
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-6 px-6 py-6">
        {error ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          >
            {error}
            <span className="mt-1 block text-xs opacity-80">
              Check Supabase SQL migration, <code className="rounded bg-muted px-1">.env.local</code>
              , and that you are signed in.
            </span>
          </motion.div>
        ) : null}

        <DashboardCards summary={summary} loading={loading} />

        <section className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
            <div>
              <h2 className="text-sm font-semibold">Jobs & timeline</h2>
              <p className="text-xs text-muted-foreground">
                Auto-refresh every 20s when you are not editing or viewing a popup
                {interactionHeld ? " · paused while you work" : ""}
              </p>
            </div>
            <TagManagerDialog tags={allTags} />
          </div>

          <FilterBar
            filters={filters}
            allTags={allTags}
            capturedByUsers={capturedByUsers}
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
              notifyMetaRef.current = { cleared: true };
              setFilters(emptyFilters);
            }}
          />

          <TimelineChart dark={dark} refreshToken={refreshTick} fetchEnabled />

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              Page {filters.page ?? 1}: {jobs.length} rows · {total} total
              {selectedIds.length > 0 && ` · ${selectedIds.length} selected`}
            </span>
            <Button
              variant="destructive"
              size="sm"
              disabled={!selectedIds.length || deleting}
              onClick={() => void handleBulkDelete()}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              {deleting ? "Deleting…" : "Delete selected"}
            </Button>
          </div>

          <JobsTable
            data={jobs}
            allTags={allTags}
            loading={loading}
            rowSelection={rowSelection}
            columnSearch={filters.column_search ?? {}}
            columnIn={filters.column_in ?? {}}
            sort={filters.sort ?? [{ field: "captured_at", dir: "desc" }]}
            listContext={listContext}
            onColumnSearchChange={handleColumnSearchChange}
            onColumnInChange={handleColumnInChange}
            onSortChange={handleSortChange}
            onRowSelectionChange={setRowSelection}
            onRefresh={refreshJobsTable}
            setInteractionHold={setInteractionHold}
            interactionHeld={interactionHeld}
          />

          <TablePagination
            page={filters.page ?? 1}
            pageSize={filters.page_size ?? 10}
            total={total}
            onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
            onPageSizeChange={(page_size) =>
              setFilters((prev) => ({ ...prev, page_size, page: 1 }))
            }
          />
        </section>
      </main>
      <Toaster theme={dark ? "dark" : "light"} position="bottom-right" richColors closeButton />
    </div>
  );
}
