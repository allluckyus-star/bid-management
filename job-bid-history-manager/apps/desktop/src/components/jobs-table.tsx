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
import { ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import { ColumnSearchDialog } from "@/components/column-search-dialog";
import { ColumnValueFilterDialog } from "@/components/column-value-filter-dialog";
import { EditableCell } from "@/components/editable-cell";
import { JdCell } from "@/components/jd-cell";
import { NotesCell } from "@/components/notes-cell";
import { ResumeCell } from "@/components/resume-cell";
import { TextPreviewDialog } from "@/components/text-preview-dialog";
import { TableColumnHeader } from "@/components/table-column-header";
import { TagCell } from "@/components/tag-cell";
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
import { fetchJobJd, fetchResumePreview, patchJob, reextractJobJd } from "@/lib/api";
import {
  COLUMN_CONTROLS,
  cycleColumnSort,
  isFilterableField,
  isOrderableField,
} from "@/lib/column-controls";
import { cn, formatDate } from "@/lib/utils";

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

  const openJd = async (job: JobListItem) => {
    setOverlayBusy(true);
    try {
      const jd = await fetchJobJd(job.id);
      setJdDialog({
        text: jd.cleaned_text,
        modelName: jd.model_name,
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to load JD");
    } finally {
      setOverlayBusy(false);
    }
  };

  const reextractJd = async (job: JobListItem) => {
    setOverlayBusy(true);
    try {
      const res = await reextractJobJd(job.id);
      setJdDialog({
        text: res.jd.cleaned_text,
        modelName: res.jd.model_name,
      });
      onRefresh();
      alert("Re-extraction complete. Structured fields updated.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Re-extract failed (is Ollama running?)");
    } finally {
      setOverlayBusy(false);
    }
  };

  const openNotes = (job: JobListItem) => {
    setNotesDialog({ jobId: job.id, body: job.notes ?? "" });
  };

  const saveNotes = async () => {
    if (!notesDialog) return;
    setNotesSaving(true);
    try {
      await patchJob(notesDialog.jobId, { notes: notesDialog.body });
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
      alert(e instanceof Error ? e.message : "Preview failed");
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
        header: () => null,
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
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
            onSave={(v) => patchJob(row.original.id, { captured_by: v }).then(() => onRefresh())}
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
            onSave={(v) => patchJob(row.original.id, { company_name: v }).then(() => onRefresh())}
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
            onSave={(v) => patchJob(row.original.id, { job_title: v }).then(() => onRefresh())}
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
            onSave={(v) => patchJob(row.original.id, { location: v }).then(() => onRefresh())}
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
            onSave={(v) => patchJob(row.original.id, { salary_text: v }).then(() => onRefresh())}
          />
        ),
      },
      {
        id: "tags",
        header: () => colHeader("tags"),
        cell: ({ row }) => (
          <TagCell
            job={row.original}
            allTags={allTags}
            holdKey={`tags-${row.original.id}`}
            onUpdated={onRefresh}
          />
        ),
      },
      {
        id: "resume",
        header: () => colHeader("resume"),
        cell: ({ row }) => (
          <ResumeCell
            job={row.original}
            busy={overlayBusy}
            onUpdated={onRefresh}
            onPreview={openResumePreview}
          />
        ),
      },
      {
        id: "jd",
        header: () => colHeader("jd"),
        cell: ({ row }) => (
          <JdCell
            job={row.original}
            busy={overlayBusy}
            onViewJd={openJd}
            onReextract={reextractJd}
          />
        ),
      },
      {
        accessorKey: "source_url",
        header: () => colHeader("source_url"),
        cell: ({ row }) => (
          <EditableCell
            holdKey={`edit-${row.original.id}-url`}
            value={row.original.source_url}
            onSave={(v) => patchJob(row.original.id, { source_url: v }).then(() => onRefresh())}
          />
        ),
      },
      {
        id: "notes",
        header: () => colHeader("notes"),
        cell: ({ row }) => <NotesCell job={row.original} onOpenNotes={openNotes} />,
      },
      {
        id: "actions",
        header: () => <TableColumnHeader label="Actions" />,
        cell: ({ row }) =>
          row.original.source_url ? (
            <a
              href={row.original.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Open
            </a>
          ) : (
            "—"
          ),
      },
    ],
    [allTags, columnSearch, columnIn, sort, onRefresh, overlayBusy],
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
      <th className="w-10 px-3 py-2 align-bottom">
        {showSelectAll && (
          <div className="flex h-[52px] items-end pb-1">
            <Checkbox
              checked={
                table.getIsAllPageRowsSelected() ||
                (table.getIsSomePageRowsSelected() && "indeterminate")
              }
              onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
              aria-label="Select all on this page"
            />
          </div>
        )}
      </th>
      {table
        .getHeaderGroups()[0]
        ?.headers.slice(1)
        .map((header) => (
          <th key={header.id} className="px-3 py-2 align-top">
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
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-3 py-2.5 align-middle">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
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
        onOpenChange={(open) => {
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
        onOpenChange={(open) => {
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
        onOpenChange={(open) => {
          if (!open) setResumeDialog(null);
        }}
        title={resumeDialog?.title ?? "Resume"}
        primary={resumeDialog?.text}
      />
    </TableInteractionContext.Provider>
  );
}
