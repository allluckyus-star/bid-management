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
import { DashboardCards } from "@/components/dashboard-cards";
import { FilterBar, type FilterState } from "@/components/filter-bar";
import { JobsTable } from "@/components/jobs-table";
import { TablePagination } from "@/components/table-pagination";
import { TagManagerDialog } from "@/components/tag-manager-dialog";
import { TimelineChart } from "@/components/timeline-chart";
import { ApiSettingsDialog } from "@/components/api-settings-dialog";
import { Button } from "@/components/ui/button";
import { ensureExtensionFolder, openExtensionFolder } from "@/lib/extension-installer";
import {
  fetchClientInfo,
  isClientMode,
  type ClientInfo,
} from "@/lib/client";
import { getClientLogPath, logClient } from "@/lib/client-log";
import { getApiBaseUrl, setClientLocalApiUrl } from "@/lib/settings";
import {
  bulkDeleteJobs,
  fetchCapturedByUsers,
  fetchDashboard,
  fetchJobs,
  fetchTags,
  seedDemoCapture,
  seedSampleData,
} from "@/lib/api";

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

export default function App() {
  const [dark, setDark] = useState(false);
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [capturedByUsers, setCapturedByUsers] = useState<string[]>([]);
  const clientMode = isClientMode();
  const [apiBaseUrl, setApiBaseUrl] = useState(getApiBaseUrl());
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [openingExtensionFolder, setOpeningExtensionFolder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedingSample, setSeedingSample] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [refreshTick, setRefreshTick] = useState(0);
  const [clientLogPath, setClientLogPath] = useState<string | null>(null);
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

  /** Client: only fetch after local proxy serves HTTP (not merely bound). */
  const clientProxyReady = !clientMode || clientInfo?.proxy_ready === true;
  const clientProxyListening =
    clientMode &&
    Boolean(clientInfo?.proxy_listen) &&
    clientInfo?.proxy_ready !== true &&
    !clientInfo?.proxy_error;

  useEffect(() => {
    if (clientMode && !clientProxyReady) return;
    let active = true;

    void ensureExtensionFolder().catch((err) => {
      if (!active) return;
      setError(err instanceof Error ? err.message : "Failed to prepare Chrome extension");
    });

    return () => {
      active = false;
    };
  }, [clientMode, clientProxyReady]);

  useEffect(() => {
    if (!clientMode) return;
    const refreshClient = () => {
      void fetchClientInfo().then((info) => {
        if (!info) {
          logClient("warn", "fetchClientInfo returned null");
          return;
        }
        setClientInfo((prev) => {
          const sig = (i: ClientInfo | null) =>
            i
              ? `ready=${i.proxy_ready} http=${i.proxy_http_ready} host_ok=${String(i.host_reachable)} local=${i.local_api_url} upstream=${i.upstream_url ?? ""} err=${i.proxy_error ?? ""}`
              : "null";
          if (sig(prev) === sig(info)) return prev;
          logClient("info", `client status change: ${sig(prev)} -> ${sig(info)}`);
          return info;
        });
        if (info.proxy_ready && info.local_api_url) {
          setClientLocalApiUrl(info.local_api_url);
          setApiBaseUrl(info.local_api_url);
        } else if (!info.proxy_ready) {
          setClientLocalApiUrl(null);
        }
      });
    };
    void getClientLogPath().then(setClientLogPath);
    refreshClient();
    const id = window.setInterval(refreshClient, 2000);
    return () => window.clearInterval(id);
  }, [clientMode]);

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

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (clientMode && !clientInfo?.proxy_ready) {
      logClient("info", "load aborted — local proxy not HTTP-ready yet");
      return;
    }
    if (silent && isInteractionHeld()) {
      queueSilentRefresh();
      return;
    }
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    const base = getApiBaseUrl();
    if (clientMode) {
      logClient(
        "info",
        `load data start (silent=${silent}) api=${base} proxy_ready=${clientInfo?.proxy_ready ?? false} host_reachable=${String(clientInfo?.host_reachable ?? null)}`,
      );
    }
    const started = performance.now();
    try {
      const [jobsRes, dashboard, tags, users] = await Promise.all([
        fetchJobs(apiFilters),
        fetchDashboard(),
        fetchTags(),
        fetchCapturedByUsers(),
      ]);
      const ms = Math.round(performance.now() - started);
      if (clientMode) {
        logClient(
          "info",
          `load data ok (${ms}ms) jobs=${jobsRes.total} tags=${tags.length} users=${users.length}`,
        );
      }
      setJobs(jobsRes.items);
      setTotal(jobsRes.total);
      setSummary(dashboard);
      setAllTags(tags);
      setCapturedByUsers(users);
      if (!silent) setRowSelection({});
      if (silent) setError(null);
      setRefreshTick((t) => t + 1);
    } catch (err) {
      const ms = Math.round(performance.now() - started);
      const msg = err instanceof Error ? err.message : "Failed to load data";
      if (clientMode) logClient("error", `load data failed (${ms}ms) api=${base}: ${msg}`);
      setError(msg);
      if (!silent) {
        setJobs([]);
        setTotal(0);
        setSummary(null);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [apiFilters, clientInfo?.proxy_ready, clientMode, isInteractionHeld, queueSilentRefresh]);

  loadRef.current = load;

  /** Table edits / tags / JD — refresh when idle (not while user is editing/viewing). */
  const refreshJobsTable = useCallback(() => {
    void load({ silent: true });
  }, [load]);

  useEffect(() => {
    if (!clientProxyReady) return;
    void load();
  }, [load, clientProxyReady]);

  useEffect(() => {
    if (!clientProxyReady) return;
    const id = window.setInterval(() => void load({ silent: true }), DATA_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [load, clientProxyReady]);

  /** Apply queued silent refresh after dialogs / cell edits close. */
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

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedDemoCapture("Desktop Demo User");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to seed demo job");
    } finally {
      setSeeding(false);
    }
  };

  const handleSeedSample = async (reset: boolean) => {
    setSeedingSample(true);
    setError(null);
    try {
      const res = await seedSampleData(reset);
      setFilters((prev) => ({ ...prev, page: 1 }));
      alert(`${res.message}\n${res.jobs_created} jobs created.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sample data");
    } finally {
      setSeedingSample(false);
    }
  };

  const handleOpenExtensionFolder = async () => {
    setOpeningExtensionFolder(true);
    try {
      await openExtensionFolder();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open Chrome extension folder");
    } finally {
      setOpeningExtensionFolder(false);
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
              {clientMode
                ? "Teammate client · Local proxy · Extension capture"
                : "Local-first · Extension capture · Ollama · Resumes · Timeline"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {clientMode ? (
                <>
                  Local API: <code>{apiBaseUrl}</code>
                  {clientInfo?.upstream_url ? (
                    <>
                      {" "}
                      → host <code>{clientInfo.upstream_url}</code>
                    </>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-300">
                      {" "}
                      · Set <strong>Host Server</strong> to your team lead PC
                    </span>
                  )}
                </>
              ) : (
                <>
                  API host: <code>{apiBaseUrl}</code>
                </>
              )}
            </p>
            {clientMode && clientLogPath ? (
              <p className="text-xs text-muted-foreground mt-1">
                Log file: <code>{clientLogPath}</code>
              </p>
            ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ApiSettingsDialog
              onSaved={() => {
                setApiBaseUrl(getApiBaseUrl());
                if (clientMode) void fetchClientInfo().then(setClientInfo);
                void load();
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={loading || (clientMode && !clientProxyReady)}
            >
              <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {clientMode ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleOpenExtensionFolder()}
                disabled={openingExtensionFolder || !clientProxyReady}
              >
                {openingExtensionFolder ? "Opening…" : "Extension Folder"}
              </Button>
            ) : null}
            {!clientMode ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleSeedSample(false)}
                  disabled={seedingSample}
                >
                  {seedingSample ? "Loading…" : "Load sample data"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => void handleSeed()} disabled={seeding}>
                  {seeding ? "Seeding…" : "+1 demo"}
                </Button>
              </>
            ) : null}
            <Button variant="ghost" size="icon" onClick={() => setDark((d) => !d)}>
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-6 px-6 py-6">
        {clientMode ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
          >
            Client runs in Chrome (not a desktop window). Astrill VPN can stay on. Use{" "}
            <strong>Extension Folder</strong> in the header to load the Chrome extension; API URL{" "}
            <code>http://127.0.0.1:4832</code>.
          </motion.div>
        ) : null}
        {clientProxyListening ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100"
          >
            Local proxy listening on <code>{clientInfo?.proxy_listen ?? "127.0.0.1:4832"}</code>…
            <span className="mt-1 block text-xs opacity-90">
              Verifying HTTP (GET /health). The UI will load data only after that succeeds.
            </span>
          </motion.div>
        ) : null}
        {clientMode && !clientProxyReady && !clientProxyListening && !clientInfo?.proxy_error ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100"
          >
            Starting local proxy on <code>127.0.0.1:4832</code>…
            <span className="mt-1 block text-xs opacity-90">
              Step 1: bind port → Step 2: serve HTTP → Step 3: load jobs from host.
            </span>
          </motion.div>
        ) : null}
        {clientMode && clientProxyReady && clientInfo?.host_reachable === false ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
          >
            Local proxy is up, but the host at{" "}
            <code>{clientInfo.upstream_url ?? "—"}</code> did not respond to /health. Check VPN,
            firewall, and that the team lead API is running.
          </motion.div>
        ) : null}
        {clientMode && clientInfo?.proxy_error ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
          >
            Local proxy failed: {clientInfo.proxy_error}
            <span className="mt-1 block text-xs opacity-90">
              Close other apps using port 4832 (e.g. a local API). Install{" "}
              <a
                className="underline"
                href="https://developer.microsoft.com/microsoft-edge/webview2/"
                target="_blank"
                rel="noreferrer"
              >
                WebView2 Runtime
              </a>{" "}
              if the app closes immediately.
            </span>
          </motion.div>
        ) : null}
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          >
            {error}
            <span className="mt-1 block text-xs opacity-80">
              {clientMode ? (
                <>
                  Ensure the team host runs <code>npm run dev:api:lan</code>, set <strong>Host Server</strong> to{" "}
                  <code>http://HOST_IP:5123</code>, and keep extension API at <code>http://127.0.0.1:4832</code> (see header).
                </>
              ) : (
                <>
                  API: <code>npm run dev:api</code> on port 5123 · Ollama optional (set JBHM_USE_MOCK_EXTRACTION=true)
                </>
              )}
            </span>
          </motion.div>
        )}

        {clientMode && !clientProxyReady ? (
          <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
            Waiting for local proxy on <code>127.0.0.1:4832</code>…
            <p className="mt-2 text-xs">
              Charts and job data load after GET /health succeeds. If the window closes by itself,
              check Event Viewer or run with <code>JBHM_CLIENT_CONSOLE=1</code>.
            </p>
          </div>
        ) : (
          <>
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
              setFilters(emptyFilters);
            }}
          />

          <TimelineChart dark={dark} refreshToken={refreshTick} fetchEnabled={clientProxyReady} />

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              Page {filters.page ?? 1}: {jobs.length} rows on screen · {total} total bids
              {selectedIds.length > 0 && ` · ${selectedIds.length} selected on this page`}
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
            onPageSizeChange={(page_size) => setFilters((prev) => ({ ...prev, page_size, page: 1 }))}
          />
        </section>
          </>
        )}
      </main>
    </div>
  );
}
