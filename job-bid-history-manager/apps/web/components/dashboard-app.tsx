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
import { Moon, RefreshCw, Sun, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInteractionHold } from "@/hooks/use-interaction-hold";
import { DashboardCards } from "@/components/jbhm/dashboard-cards";
import { FilterBar, type FilterState } from "@/components/jbhm/filter-bar";
import { JobsTable } from "@/components/jbhm/jobs-table";
import { TablePagination } from "@/components/jbhm/table-pagination";
import { TagManagerDialog } from "@/components/jbhm/tag-manager-dialog";
import { TimelineChart } from "@/components/jbhm/timeline-chart";
import { ExtensionTokensPanel } from "@/components/extension-tokens-panel";
import { Button } from "@/components/ui/button";
import {
  bulkDeleteJobs,
  fetchCapturedByUsers,
  fetchDashboard,
  fetchJobs,
  fetchTags,
} from "@/lib/api/client";

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

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
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
        setJobs(jobsRes.items);
        setTotal(jobsRes.total);
        setSummary(dashboard);
        setAllTags(tags);
        setCapturedByUsers(users);
        if (!silent) setRowSelection({});
        if (silent) setError(null);
        setRefreshTick((t) => t + 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load data";
        setError(msg);
        if (!silent) {
          setJobs([]);
          setTotal(0);
          setSummary(null);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [apiFilters, isInteractionHeld, queueSilentRefresh],
  );

  loadRef.current = load;

  const refreshJobsTable = useCallback(() => {
    void load({ silent: true });
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => void load({ silent: true }), DATA_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (interactionHeld) return;
    if (!consumePendingSilent()) return;
    void loadRef.current?.({ silent: true });
  }, [interactionHeld, consumePendingSilent]);

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return;
    if (!confirm(`Soft-delete ${selectedIds.length} selected job(s)?`)) return;
    setDeleting(true);
    try {
      await bulkDeleteJobs(selectedIds);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt=""
              className="h-10 w-10 shrink-0 rounded-lg object-contain"
              width={40}
              height={40}
            />
            <div>
              <h1 className="text-xl font-bold tracking-tight">Job Bid History Manager</h1>
              <p className="text-sm text-muted-foreground">
                Shared team board · Web · Chrome extension capture
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
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

        <ExtensionTokensPanel />

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
            onClear={() => setFilters(emptyFilters)}
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
    </div>
  );
}
