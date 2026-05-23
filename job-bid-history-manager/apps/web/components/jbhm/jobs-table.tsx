import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
} from "@tanstack/react-table";
import type {
  JobColumnSearch,
  JobColumnSelections,
  JobFilterableField,
  JobFilters,
  JobListItem,
  JobSortEntry,
  JobSortField,
  Tag,
} from "@jbhm/shared";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { ColumnSearchDialog } from "@/components/jbhm/column-search-dialog";
import { ColumnValueFilterDialog } from "@/components/jbhm/column-value-filter-dialog";
import { EditableCell } from "@/components/jbhm/editable-cell";
import { JdCell } from "@/components/jbhm/jd-cell";
import { NotesCell } from "@/components/jbhm/notes-cell";
import { ResumeCell } from "@/components/jbhm/resume-cell";

const TextPreviewDialog = dynamic(
  () =>
    import("@/components/jbhm/text-preview-dialog").then((m) => ({
      default: m.TextPreviewDialog,
    })),
  { ssr: false },
);
import { TableColumnHeader } from "@/components/jbhm/table-column-header";
import { TagCell } from "@/components/jbhm/tag-cell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TableInteractionContext } from "@/context/table-interaction";
import { useHoldKey } from "@/hooks/use-interaction-hold";
import { fetchJob, fetchJobJd, fetchResumePreview, patchJob } from "@/lib/api/client";
import { notifyActionSuccess, notifyLoadError } from "@/lib/jbhm/notify";
import {
  COLUMN_CONTROLS,
  cycleColumnSort,
  isFilterableField,
  isOrderableField,
} from "@/lib/jbhm/column-controls";
import { cn, formatDate } from "@/lib/utils";

type ColumnMeta = { align?: "center" | "left" };

const centeredCell = "text-center";
const centeredWrap = "flex justify-center";

type Props = {
  data: JobListItem[];
  allTags: Tag[];
  loading: boolean;
  rowSelection: RowSelectionState;
  columnSearch: JobColumnSearch;
  columnIn: JobColumnSelections;
  sort: JobSortEntry[];
  listContext: JobFilters;
  onColumnSearchChange: (field: JobSortField, value: string) => void;
  onColumnInChange: (field: JobFilterableField, values: string[] | undefined) => void;
  onSortChange: (sort: JobSortEntry[]) => void;
  onRowSelectionChange: (state: RowSelectionState) => void;
  onDeleteJob: (jobId: string) => void;
  deleteBusy?: boolean;
  onRefresh: () => void;
  setInteractionHold: (key: string, active: boolean) => void;
  interactionHeld: boolean;
};

export function JobsTable({
  data,
  allTags,
  loading,
  rowSelection,
  columnSearch,
  columnIn,
  sort,
  listContext,
  onColumnSearchChange,
  onColumnInChange,
  onSortChange,
  onRowSelectionChange,
  onDeleteJob,
  deleteBusy = false,
  onRefresh,
  setInteractionHold,
  interactionHeld,
}: Props) {
  const [filterField, setFilterField] = useState<JobFilterableField | null>(null);
  const [searchField, setSearchField] = useState<JobSortField | null>(null);
  const [jdDialog, setJdDialog] = useState<{
    text: string | null;
    modelName: string | null;
  } | null>(null);
  const [notesDialog, setNotesDialog] = useState<{ jobId: string; body: string } | null>(null);
  const [resumeDialog, setResumeDialog] = useState<{
    title: string;
    text: string;
  } | null>(null);
  const [overlayBusy, setOverlayBusy] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);

  useHoldKey(setInteractionHold, "column-filter", !!filterField);
  useHoldKey(setInteractionHold, "column-search", !!searchField);
  useHoldKey(setInteractionHold, "jd-dialog", !!jdDialog);
  useHoldKey(setInteractionHold, "notes-dialog", !!notesDialog);
  useHoldKey(setInteractionHold, "resume-dialog", !!resumeDialog);

  const saveField = (jobId: string, patch: Parameters<typeof patchJob>[1]) =>
    patchJob(jobId, patch)
      .then(() => {
        notifyActionSuccess("Saved");
        onRefresh();
      })
      .catch((e) => notifyLoadError(e instanceof Error ? e.message : "Save failed"));

  const openJd = async (job: JobListItem) => {
    setOverlayBusy(true);
    try {
      const jd = await fetchJobJd(job.id);
      setJdDialog({
        text: jd.cleaned_text,
        modelName: jd.model_name,
      });
    } catch (e) {
      notifyLoadError(e instanceof Error ? e.message : "Failed to load JD");
    } finally {
      setOverlayBusy(false);
    }
  };

  const openNotes = async (job: JobListItem) => {
    setOverlayBusy(true);
    try {
      const detail = await fetchJob(job.id);
      setNotesDialog({ jobId: job.id, body: detail.notes ?? "" });
    } catch (e) {
      notifyLoadError(e instanceof Error ? e.message : "Failed to load notes");
    } finally {
      setOverlayBusy(false);
    }
  };

  const saveNotes = async () => {
    if (!notesDialog) return;
    setNotesSaving(true);
    try {
      await patchJob(notesDialog.jobId, { notes: notesDialog.body });
      notifyActionSuccess("Notes saved");
      onRefresh();
      setNotesDialog(null);
    } finally {
      setNotesSaving(false);
    }
  };

  const openResumePreview = async (job: JobListItem) => {
    if (!job.resume) return;
    setOverlayBusy(true);
    try {
      const text = await fetchResumePreview(job.resume.id);
      setResumeDialog({
        title: `Resume — ${job.resume.original_filename}`,
        text,
      });
    } catch (e) {
      notifyLoadError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setOverlayBusy(false);
    }
  };

  const interactionCtx = useMemo(
    () => ({ setHold: setInteractionHold, interactionHeld }),
    [setInteractionHold, interactionHeld],
  );
  const colHeader = (field: JobSortField) => {
    const cfg = COLUMN_CONTROLS[field];
    const sortEntry = sort.find((s) => s.field === field);
    return (
      <TableColumnHeader
        field={field}
        filterActive={isFilterableField(field) && !!columnIn[field]?.length}
        searchActive={!!columnSearch[field]?.trim()}
        sortDir={sortEntry ? sortEntry.dir : null}
        onFilterClick={
          cfg.filter && isFilterableField(field)
            ? () => setFilterField(field)
            : undefined
        }
        onSortClick={
          cfg.sort && isOrderableField(field)
            ? () => onSortChange(cycleColumnSort(sort, field))
            : undefined
        }
        onSearchClick={cfg.search ? () => setSearchField(field) : undefined}
      />
    );
  };

  const columns = useMemo<ColumnDef<JobListItem>[]>(
    () => [
      {
        id: "select",
        meta: { align: "center" } satisfies ColumnMeta,
        header: () => (
          <span className="sr-only">Select</span>
        ),
        cell: ({ row }) => (
          <div className={centeredWrap}>
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value: boolean | "indeterminate") =>
                row.toggleSelected(!!value)
              }
              aria-label="Select row"
            />
          </div>
        ),
        size: 40,
      },
      {
        accessorKey: "captured_at",
        header: () => colHeader("captured_at"),
        cell: ({ row }) => formatDate(row.original.captured_at),
      },
      {
        accessorKey: "captured_by",
        header: () => colHeader("captured_by"),
        cell: ({ row }) => (
          <EditableCell
            holdKey={`edit-${row.original.id}-captured_by`}
            value={row.original.captured_by}
            onSave={(v) => saveField(row.original.id, { captured_by: v })}
          />
        ),
      },
      {
        accessorKey: "company_name",
        header: () => colHeader("company_name"),
        cell: ({ row }) => (
          <EditableCell
            holdKey={`edit-${row.original.id}-company`}
            value={row.original.company_name}
            onSave={(v) => saveField(row.original.id, { company_name: v })}
          />
        ),
      },
      {
        accessorKey: "job_title",
        header: () => colHeader("job_title"),
        cell: ({ row }) => (
          <EditableCell
            holdKey={`edit-${row.original.id}-title`}
            value={row.original.job_title}
            onSave={(v) => saveField(row.original.id, { job_title: v })}
          />
        ),
      },
      {
        accessorKey: "location",
        header: () => colHeader("location"),
        cell: ({ row }) => (
          <EditableCell
            holdKey={`edit-${row.original.id}-location`}
            value={row.original.location}
            onSave={(v) => saveField(row.original.id, { location: v })}
          />
        ),
      },
      {
        accessorKey: "salary_text",
        header: () => colHeader("salary_text"),
        cell: ({ row }) => (
          <EditableCell
            holdKey={`edit-${row.original.id}-salary`}
            value={row.original.salary_text}
            onSave={(v) => saveField(row.original.id, { salary_text: v })}
          />
        ),
      },
      {
        id: "tags",
        meta: { align: "center" } satisfies ColumnMeta,
        header: () => colHeader("tags"),
        cell: ({ row }) => (
          <div className={centeredWrap}>
            <TagCell
              job={row.original}
              allTags={allTags}
              holdKey={`tags-${row.original.id}`}
              onUpdated={onRefresh}
            />
          </div>
        ),
      },
      {
        id: "resume",
        meta: { align: "center" } satisfies ColumnMeta,
        header: () => colHeader("resume"),
        cell: ({ row }) => (
          <div className={centeredWrap}>
            <ResumeCell
              job={row.original}
              busy={overlayBusy}
              onUpdated={onRefresh}
              onPreview={openResumePreview}
            />
          </div>
        ),
      },
      {
        id: "jd",
        meta: { align: "center" } satisfies ColumnMeta,
        header: () => colHeader("jd"),
        cell: ({ row }) => (
          <div className={centeredWrap}>
            <JdCell job={row.original} busy={overlayBusy} onViewJd={openJd} />
          </div>
        ),
      },
      {
        accessorKey: "source_url",
        header: () => colHeader("source_url"),
        cell: ({ row }) => (
          <EditableCell
            holdKey={`edit-${row.original.id}-url`}
            value={row.original.source_url}
            onSave={(v) => saveField(row.original.id, { source_url: v })}
          />
        ),
      },
      {
        id: "notes",
        meta: { align: "center" } satisfies ColumnMeta,
        header: () => colHeader("notes"),
        cell: ({ row }) => (
          <div className={centeredWrap}>
            <NotesCell job={row.original} onOpenNotes={openNotes} />
          </div>
        ),
      },
      {
        id: "actions",
        meta: { align: "center" } satisfies ColumnMeta,
        header: () => <TableColumnHeader label="Actions" />,
        cell: ({ row }) => (
          <div className={cn(centeredWrap, "gap-2")}>
            {row.original.source_url ? (
              <a
                href={row.original.source_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Open
              </a>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={deleteBusy}
              onClick={() => onDeleteJob(row.original.id)}
              aria-label="Delete job"
              title="Delete job"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    [allTags, columnSearch, columnIn, sort, onRefresh, overlayBusy, onDeleteJob, deleteBusy],
  );

  const table = useReactTable({
    data,
    columns,
    state: { rowSelection },
    enableRowSelection: true,
    onRowSelectionChange: (updater) => {
      const next = typeof updater === "function" ? updater(rowSelection) : updater;
      onRowSelectionChange(next);
    },
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  const headerRow = (showSelectAll: boolean) => (
    <tr className="border-b bg-muted/40">
      <th className="w-10 px-3 py-2 align-bottom text-center">
        {showSelectAll && (
          <div className="flex h-[52px] items-end justify-center pb-1">
            <Checkbox
              checked={
                table.getIsAllPageRowsSelected() ||
                (table.getIsSomePageRowsSelected() && "indeterminate")
              }
              onCheckedChange={(value: boolean | "indeterminate") =>
                table.toggleAllPageRowsSelected(!!value)
              }
              aria-label="Select all on this page"
            />
          </div>
        )}
      </th>
      {table
        .getHeaderGroups()[0]
        ?.headers.slice(1)
        .map((header) => (
          <th key={header.id} className="px-3 py-2 align-top text-center">
            {flexRender(header.column.columnDef.header, header.getContext())}
          </th>
        ))}
    </tr>
  );

  const showInitialLoader = loading && data.length === 0;

  if (showInitialLoader) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border bg-card text-sm text-muted-foreground">
        Loading job history…
      </div>
    );
  }

  return (
    <TableInteractionContext.Provider value={interactionCtx}>
      {filterField && (
        <ColumnValueFilterDialog
          open
          field={filterField}
          selected={columnIn[filterField]}
          listContext={listContext}
          onClose={() => setFilterField(null)}
          onApply={(values) => onColumnInChange(filterField, values)}
        />
      )}
      {searchField && (
        <ColumnSearchDialog
          open
          field={searchField}
          value={columnSearch[searchField] ?? ""}
          onClose={() => setSearchField(null)}
          onApply={(v) => onColumnSearchChange(searchField, v)}
        />
      )}
      {data.length === 0 ? (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] border-collapse text-sm">
              <thead>{headerRow(false)}</thead>
            </table>
          </div>
          <div className="flex h-32 flex-col items-center justify-center gap-2 border-t text-sm text-muted-foreground">
            <p>No bids match your filters.</p>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "relative overflow-hidden rounded-xl border bg-card shadow-sm",
            loading && !interactionHeld && "opacity-80",
          )}
        >
          {loading && !interactionHeld ? (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-primary/10 px-3 py-1 text-center text-xs text-muted-foreground">
              Refreshing…
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] border-collapse text-sm">
              <thead>{headerRow(true)}</thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {table.getRowModel().rows.map((row) => (
                    <motion.tr
                      key={row.id}
                      initial={false}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      className="border-b transition-colors hover:bg-muted/30 data-[state=selected]:bg-muted/50"
                      data-state={row.getIsSelected() ? "selected" : undefined}
                    >
                      {row.getVisibleCells().map((cell) => {
                        const meta = cell.column.columnDef.meta as ColumnMeta | undefined;
                        return (
                          <td
                            key={cell.id}
                            className={cn(
                              "px-3 py-2.5 align-middle",
                              meta?.align === "center" && centeredCell,
                            )}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      })}
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <TextPreviewDialog
        open={!!jdDialog}
        onOpenChange={(open: boolean) => {
          if (!open) setJdDialog(null);
        }}
        title={
          jdDialog?.modelName
            ? `Job description · ${jdDialog.modelName}`
            : "Job description"
        }
        primary={jdDialog?.text}
      />

      <Dialog
        open={!!notesDialog}
        onOpenChange={(open: boolean) => {
          if (!open) setNotesDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Notes</DialogTitle>
          </DialogHeader>
          <textarea
            className="min-h-[160px] w-full rounded-lg border bg-background p-3 text-sm"
            value={notesDialog?.body ?? ""}
            onChange={(e) =>
              setNotesDialog((prev) => (prev ? { ...prev, body: e.target.value } : prev))
            }
            placeholder="Applied via LinkedIn, follow-up Monday…"
          />
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setNotesDialog(null)}>
              Cancel
            </Button>
            <Button onClick={() => void saveNotes()} disabled={notesSaving}>
              {notesSaving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TextPreviewDialog
        open={!!resumeDialog}
        onOpenChange={(open: boolean) => {
          if (!open) setResumeDialog(null);
        }}
        title={resumeDialog?.title ?? "Resume"}
        primary={resumeDialog?.text}
      />
    </TableInteractionContext.Provider>
  );
}
