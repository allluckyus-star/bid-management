"use client";

import { Upload } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  JobColumnSelections,
  JobFilterableField,
  JobFilters,
  JobListItem,
  JobSortEntry,
  JobSortField,
} from "@jbhm/shared";

import { ColumnSearchDialog } from "@/components/jbhm/column-search-dialog";
import { ColumnValueFilterDialog } from "@/components/jbhm/column-value-filter-dialog";
import { TableColumnHeader } from "@/components/jbhm/table-column-header";
import { TablePagination } from "@/components/jbhm/table-pagination";
import { TextPreviewDialog } from "@/components/jbhm/text-preview-dialog";
import { Button } from "@/components/ui/button";
import {
  createManualJdSource,
  fetchJobJd,
  fetchJobs,
  fetchTeamJdSettings,
  setTeamJdMode,
  type TeamJdSelectionView,
} from "@/lib/api/client";
import { cycleColumnSort, isFilterableField, isOrderableField } from "@/lib/jbhm/column-controls";
import { notifyActionSuccess, notifyLoadError } from "@/lib/jbhm/notify";
import { formatDate } from "@/lib/utils";

type Mode = "latest" | "history" | "manual";
type ManualSourceKind = "paste" | "upload";

const emptySelection = (): TeamJdSelectionView["selection"] => ({
  mode: "latest",
  history_job_id: null,
  manual_input_id: null,
  updated_at: null,
});

export function TeamJdPage({ teamId }: { teamId: string }) {
  const [view, setView] = useState<TeamJdSelectionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savingSelection, setSavingSelection] = useState(false);
  const [manualText, setManualText] = useState("");
  const [savedSelection, setSavedSelection] = useState<TeamJdSelectionView["selection"]>(emptySelection);
  const [draftSelection, setDraftSelection] = useState<TeamJdSelectionView["selection"]>(emptySelection);
  const [manualSources, setManualSources] = useState<{
    pasteId: string | null;
    uploadId: string | null;
    uploadLabel: string | null;
  }>({ pasteId: null, uploadId: null, uploadLabel: null });
  const [draftManualSource, setDraftManualSource] = useState<ManualSourceKind | null>(null);
  const [savedManualSource, setSavedManualSource] = useState<ManualSourceKind | null>(null);
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const [historyRows, setHistoryRows] = useState<JobListItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [filterField, setFilterField] = useState<JobFilterableField | null>(null);
  const [searchField, setSearchField] = useState<JobSortField | null>(null);
  const [jdDialog, setJdDialog] = useState<{
    text: string | null;
    modelName: string | null;
  } | null>(null);
  const [historyFilters, setHistoryFilters] = useState<JobFilters>({
    sort: [{ field: "captured_at", dir: "desc" }],
    page: 1,
    page_size: 10,
    column_search: {},
    column_in: {},
  });
  const uploadRef = useRef<HTMLInputElement>(null);
  const lastSavedManualTextRef = useRef("");

  const syncManualSourcesFromView = useCallback((v: TeamJdSelectionView) => {
    let pasteId: string | null = null;
    let uploadId: string | null = null;
    let uploadLabel: string | null = null;
    for (const item of v.manual_items) {
      if (item.source_type === "text") pasteId = item.id;
      else {
        uploadId = item.id;
        uploadLabel = item.label;
      }
    }
    let active: ManualSourceKind | null = null;
    if (v.selection.mode === "manual" && v.selection.manual_input_id) {
      if (v.selection.manual_input_id === pasteId) active = "paste";
      else if (v.selection.manual_input_id === uploadId) active = "upload";
    }
    setManualSources({ pasteId, uploadId, uploadLabel });
    setDraftManualSource(active);
    setSavedManualSource(active);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const v = await fetchTeamJdSettings(teamId);
      setView(v);
      setSavedSelection(v.selection);
      setDraftSelection(v.selection);
      syncManualSourcesFromView(v);
    } catch (e) {
      notifyLoadError(e instanceof Error ? e.message : "Failed to load JD settings");
    } finally {
      setLoading(false);
    }
  }, [teamId, syncManualSourcesFromView]);

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetchJobs(teamId, historyFilters);
      setHistoryRows(res.items);
      setHistoryTotal(res.total);
    } catch (e) {
      notifyLoadError(e instanceof Error ? e.message : "Failed to load JD history");
    } finally {
      setHistoryLoading(false);
    }
  }, [teamId, historyFilters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const selectedMode = draftSelection.mode as Mode;
  const selectedHistoryId = draftSelection.history_job_id;

  const hasUnsavedPaste =
    draftSelection.mode === "manual" &&
    draftManualSource === "paste" &&
    manualText.trim().length > 0 &&
    manualText.trim() !== lastSavedManualTextRef.current;

  const hasUnsavedUpload = draftSelection.mode === "manual" && draftManualSource === "upload" && !!pendingUploadFile;

  const hasSelectionChanges =
    draftSelection.mode !== savedSelection.mode ||
    (draftSelection.history_job_id ?? null) !== (savedSelection.history_job_id ?? null) ||
    (draftSelection.manual_input_id ?? null) !== (savedSelection.manual_input_id ?? null) ||
    draftManualSource !== savedManualSource ||
    hasUnsavedPaste ||
    hasUnsavedUpload;

  const commitSavedState = (
    selection: TeamJdSelectionView["selection"],
    manualSource: ManualSourceKind | null,
    options?: { savedPasteText?: string; clearPendingUpload?: boolean },
  ) => {
    setSavedSelection(selection);
    setDraftSelection(selection);
    setSavedManualSource(manualSource);
    setDraftManualSource(manualSource);
    if (options?.savedPasteText !== undefined) {
      lastSavedManualTextRef.current = options.savedPasteText;
    }
    if (options?.clearPendingUpload) {
      setPendingUploadFile(null);
    }
  };

  const selectManualSource = (kind: ManualSourceKind) => {
    setDraftManualSource(kind);
    const sourceId = kind === "paste" ? manualSources.pasteId : manualSources.uploadId;
    setDraftSelection((prev) => ({
      ...prev,
      mode: "manual",
      history_job_id: null,
      manual_input_id: sourceId,
    }));
  };

  const selectModeFromCard = (mode: Mode) => {
    if (mode === "manual") {
      setDraftManualSource((prev) => prev ?? savedManualSource ?? "paste");
      setDraftSelection((prev) => ({
        ...prev,
        mode: "manual",
        history_job_id: null,
      }));
      return;
    }
    setDraftManualSource(null);
    setDraftSelection((prev) => ({
      ...prev,
      mode,
      history_job_id: mode === "history" ? prev.history_job_id : null,
      manual_input_id: null,
    }));
  };

  const saveSelection = async () => {
    setSavingSelection(true);
    try {
      let manualInputId: string | null = null;
      if (draftSelection.mode === "manual") {
        if (draftManualSource === "upload") {
          if (pendingUploadFile) {
            const item = await createManualJdSource(teamId, { file: pendingUploadFile });
            manualInputId = item.id;
            setManualSources((prev) => ({
              ...prev,
              uploadId: item.id,
              uploadLabel: item.label,
            }));
            setPendingUploadFile(null);
          } else {
            manualInputId = manualSources.uploadId;
          }
          if (!manualInputId) {
            notifyLoadError("Upload a JD file first.");
            return;
          }
        } else if (draftManualSource === "paste") {
          const normalized = manualText.trim();
          if (!normalized) {
            notifyLoadError("Paste JD text first.");
            return;
          }
          const item = await createManualJdSource(teamId, { text: normalized });
          lastSavedManualTextRef.current = normalized;
          manualInputId = item.id;
          setManualSources((prev) => ({ ...prev, pasteId: item.id }));
        } else {
          notifyLoadError("Choose pasted JD or uploaded JD.");
          return;
        }
      }

      await setTeamJdMode(teamId, {
        mode: draftSelection.mode,
        history_job_id: draftSelection.mode === "history" ? draftSelection.history_job_id ?? null : null,
        manual_input_id: draftSelection.mode === "manual" ? manualInputId : null,
      });

      const nextSelection: TeamJdSelectionView["selection"] = {
        ...draftSelection,
        manual_input_id: draftSelection.mode === "manual" ? manualInputId : null,
      };
      const savedManual = draftSelection.mode === "manual" ? draftManualSource : null;
      if (draftSelection.mode === "manual" && manualInputId) {
        setManualSources((prev) =>
          savedManual === "paste"
            ? { ...prev, pasteId: manualInputId }
            : savedManual === "upload"
              ? { ...prev, uploadId: manualInputId }
              : prev,
        );
      }
      commitSavedState(nextSelection, savedManual, {
        savedPasteText: savedManual === "paste" ? manualText.trim() : lastSavedManualTextRef.current,
        clearPendingUpload: savedManual === "upload",
      });

      try {
        const nextView = await fetchTeamJdSettings(teamId);
        setView(nextView);
        setManualSources((prev) => {
          let pasteId = prev.pasteId;
          let uploadId = prev.uploadId;
          let uploadLabel = prev.uploadLabel;
          for (const item of nextView.manual_items) {
            if (item.source_type === "text") pasteId = item.id;
            else {
              uploadId = item.id;
              uploadLabel = item.label;
            }
          }
          return { pasteId, uploadId, uploadLabel };
        });
      } catch {
        // PATCH succeeded; keep committed local selection if refresh fails.
      }
      notifyActionSuccess("JD source saved");
    } catch (e) {
      notifyLoadError(e instanceof Error ? e.message : "Failed to save JD source");
    } finally {
      setSavingSelection(false);
    }
  };

  const shouldIgnoreCardClick = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(
      target.closest("button, a, table, input[type='radio'], [role='dialog'], [data-skip-mode-select]"),
    );
  };

  const stageUpload = (file: File | undefined) => {
    if (!file) return;
    setPendingUploadFile(file);
    setDraftManualSource("upload");
    setDraftSelection((prev) => ({
      ...prev,
      mode: "manual",
      history_job_id: null,
      manual_input_id: manualSources.uploadId,
    }));
    if (uploadRef.current) uploadRef.current.value = "";
  };

  const manualPasteSelected = selectedMode === "manual" && draftManualSource === "paste";
  const manualUploadSelected = selectedMode === "manual" && draftManualSource === "upload";
  const manualSourceClass = (selected: boolean) =>
    selected ? "ring-2 ring-primary border-primary" : "border-muted-foreground/40";

  const cardClass = (mode: Mode) =>
    `rounded-xl border bg-card p-4 transition cursor-pointer ${
      selectedMode === mode
        ? "ring-2 ring-primary border-primary shadow-sm"
        : "border-muted-foreground/30 opacity-60 hover:opacity-80"
    }`;

  const listContext: JobFilters = useMemo(
    () => ({
      captured_by: historyFilters.captured_by,
      date_from: historyFilters.date_from,
      date_to: historyFilters.date_to,
      column_search: historyFilters.column_search,
      column_in: historyFilters.column_in,
    }),
    [historyFilters],
  );

  const sort = historyFilters.sort ?? [{ field: "captured_at", dir: "desc" }];
  const columnSearch = historyFilters.column_search ?? {};
  const columnIn = historyFilters.column_in ?? {};

  const handleColumnSearchChange = (field: JobSortField, value: string) => {
    setHistoryFilters((prev) => {
      const next = { ...(prev.column_search ?? {}) };
      if (value.trim()) next[field] = value;
      else delete next[field];
      return { ...prev, column_search: next, page: 1 };
    });
  };

  const handleColumnInChange = (field: JobFilterableField, values: string[] | undefined) => {
    setHistoryFilters((prev) => {
      const next: JobColumnSelections = { ...(prev.column_in ?? {}) };
      if (values?.length) next[field] = values;
      else delete next[field];
      return { ...prev, column_in: next, page: 1 };
    });
  };

  const openJd = async (job: JobListItem) => {
    try {
      const jd = await fetchJobJd(teamId, job.id);
      setJdDialog({
        text: jd.cleaned_text,
        modelName: jd.model_name,
      });
    } catch (e) {
      notifyLoadError(e instanceof Error ? e.message : "Failed to load JD");
    }
  };

  const headerCell = (field: JobSortField, label: string) => {
    const sortEntry = sort.find((s) => s.field === field);
    return (
      <TableColumnHeader
        field={field}
        label={label}
        filterActive={isFilterableField(field) && !!columnIn[field]?.length}
        searchActive={!!columnSearch[field]?.trim()}
        sortDir={sortEntry ? sortEntry.dir : null}
        onSortClick={
          isOrderableField(field)
            ? () =>
                setHistoryFilters((prev) => ({
                  ...prev,
                  sort: cycleColumnSort(sort, field),
                  page: 1,
                }))
            : undefined
        }
        onFilterClick={isFilterableField(field) ? () => setFilterField(field) : undefined}
        onSearchClick={() => setSearchField(field)}
      />
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">JD source for optimization</h1>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/team/${teamId}/dashboard`}>Back to dashboard</Link>
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <section
            className={cardClass("manual")}
            onClick={(e) => {
              if (shouldIgnoreCardClick(e.target)) return;
              selectModeFromCard("manual");
            }}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div
                className={`relative rounded-md border ${manualSourceClass(manualPasteSelected)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  selectModeFromCard("manual");
                  selectManualSource("paste");
                }}
              >
                {manualPasteSelected && (
                  <span className="absolute right-2 top-2 z-10 rounded bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                    Selected
                  </span>
                )}
                <textarea
                  value={manualText}
                  onChange={(e) => {
                    setManualText(e.target.value);
                    selectModeFromCard("manual");
                    selectManualSource("paste");
                  }}
                  onFocus={() => {
                    selectModeFromCard("manual");
                    selectManualSource("paste");
                  }}
                  className="min-h-[180px] w-full rounded-md border-0 bg-background p-3 text-sm focus-visible:outline-none"
                  placeholder="Paste JD text..."
                  disabled={busy || savingSelection}
                />
              </div>
              <div
                className="relative"
                onDragOver={(e) => {
                  if (busy || savingSelection) return;
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  if (busy || savingSelection) return;
                  e.preventDefault();
                  selectModeFromCard("manual");
                  selectManualSource("upload");
                  stageUpload(e.dataTransfer.files?.[0]);
                }}
              >
                {manualUploadSelected && (
                  <span className="absolute right-2 top-2 z-10 rounded bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                    Selected
                  </span>
                )}
                <input
                  ref={uploadRef}
                  type="file"
                  accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => {
                    selectModeFromCard("manual");
                    selectManualSource("upload");
                    stageUpload(e.target.files?.[0]);
                  }}
                />
                <Button
                  variant="outline"
                  className={`h-full min-h-[180px] w-full border-dashed ${manualUploadSelected ? "border-primary ring-2 ring-primary" : ""}`}
                  disabled={busy || savingSelection}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectModeFromCard("manual");
                    selectManualSource("upload");
                    uploadRef.current?.click();
                  }}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {pendingUploadFile?.name ?? manualSources.uploadLabel ?? "Drag or upload JD"}
                </Button>
              </div>
            </div>
          </section>

          <section
            className={cardClass("latest")}
            onClick={(e) => {
              if (shouldIgnoreCardClick(e.target)) return;
              selectModeFromCard("latest");
            }}
          >
            <h2 className="text-base font-semibold">Latest job bid JD</h2>
          </section>

          <section
            className={cardClass("history")}
            onClick={(e) => {
              if (shouldIgnoreCardClick(e.target)) return;
              selectModeFromCard("history");
            }}
          >
            <h2 className="mb-3 text-base font-semibold">JD history</h2>

            {filterField && (
              <ColumnValueFilterDialog
                open
                field={filterField}
                selected={columnIn[filterField]}
                listContext={listContext}
                onClose={() => setFilterField(null)}
                onApply={(values) => handleColumnInChange(filterField, values)}
              />
            )}
            {searchField && (
              <ColumnSearchDialog
                open
                field={searchField}
                value={columnSearch[searchField] ?? ""}
                onClose={() => setSearchField(null)}
                onApply={(v) => handleColumnSearchChange(searchField, v)}
              />
            )}

            <div
              className="overflow-hidden rounded-xl border bg-card shadow-sm"
              data-skip-mode-select
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="w-10 px-2 py-2 text-center">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Pick
                        </span>
                      </th>
                      <th className="px-3 py-2 text-center">{headerCell("company_name", "Company")}</th>
                      <th className="px-3 py-2 text-center">{headerCell("captured_by", "User")}</th>
                      <th className="px-3 py-2 text-center">{headerCell("job_title", "Role")}</th>
                      <th className="px-3 py-2 text-center">{headerCell("jd", "JD")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                          {historyLoading ? "Loading history…" : "No bids match current filters."}
                        </td>
                      </tr>
                    ) : (
                      historyRows.map((row) => {
                        const checked =
                          selectedMode === "history" && selectedHistoryId === row.id;
                        return (
                          <tr
                            key={row.id}
                            className={`border-b transition-colors hover:bg-muted/30 ${checked ? "bg-primary/5" : ""}`}
                          >
                            <td className="px-2 py-2 text-center">
                              <input
                                type="radio"
                                name="jd-history-row"
                                checked={checked}
                                disabled={busy || savingSelection}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  setDraftSelection((prev) => ({
                                    ...prev,
                                    mode: "history",
                                    history_job_id: row.id,
                                    manual_input_id: null,
                                  }));
                                  setDraftManualSource(null);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`Select JD for ${row.company_name ?? row.id}`}
                              />
                            </td>
                            <td className="px-3 py-2">{row.company_name || "-"}</td>
                            <td className="px-3 py-2">{row.captured_by || "-"}</td>
                            <td className="px-3 py-2">{row.job_title || "-"}</td>
                            <td className="px-3 py-2 text-xs">
                              {row.has_jd ? (
                                <button
                                  type="button"
                                  className="text-primary hover:underline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void openJd(row);
                                  }}
                                >
                                  View JD ({formatDate(row.captured_at)})
                                </button>
                              ) : (
                                <span className="text-muted-foreground">No JD</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div data-skip-mode-select>
              <TablePagination
                page={historyFilters.page ?? 1}
                pageSize={historyFilters.page_size ?? 10}
                total={historyTotal}
                onPageChange={(page) => setHistoryFilters((prev) => ({ ...prev, page }))}
                onPageSizeChange={(page_size) =>
                  setHistoryFilters((prev) => ({ ...prev, page_size, page: 1 }))
                }
              />
            </div>
          </section>
        </>
      )}

      {!loading && (
        <div className="flex justify-end">
          <Button
            onClick={() => void saveSelection()}
            disabled={savingSelection || busy || !hasSelectionChanges}
          >
            {savingSelection ? "Saving..." : "Save"}
          </Button>
        </div>
      )}

      <TextPreviewDialog
        open={!!jdDialog}
        onOpenChange={(open) => {
          if (!open) setJdDialog(null);
        }}
        title={jdDialog?.modelName ? `Job description · ${jdDialog.modelName}` : "Job description"}
        primary={jdDialog?.text}
      />
    </div>
  );
}
