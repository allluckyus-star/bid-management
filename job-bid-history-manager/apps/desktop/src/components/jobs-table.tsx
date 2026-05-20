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
import { TableColumnHeader } from "@/components/table-column-header";
import { TagCell } from "@/components/tag-cell";
import { Checkbox } from "@/components/ui/checkbox";
import { patchJob } from "@/lib/api";
import {
  COLUMN_CONTROLS,
  cycleColumnSort,
  isFilterableField,
  isOrderableField,
} from "@/lib/column-controls";
import { formatDate } from "@/lib/utils";

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
}: Props) {
  const [filterField, setFilterField] = useState<JobFilterableField | null>(null);
  const [searchField, setSearchField] = useState<JobSortField | null>(null);
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
            value={row.original.salary_text}
            onSave={(v) => patchJob(row.original.id, { salary_text: v }).then(() => onRefresh())}
          />
        ),
      },
      {
        id: "tags",
        header: () => colHeader("tags"),
        cell: ({ row }) => <TagCell job={row.original} allTags={allTags} onUpdated={onRefresh} />,
      },
      {
        id: "resume",
        header: () => colHeader("resume"),
        cell: ({ row }) => <ResumeCell job={row.original} onUpdated={onRefresh} />,
      },
      {
        id: "jd",
        header: () => colHeader("jd"),
        cell: ({ row }) => <JdCell job={row.original} onUpdated={onRefresh} />,
      },
      {
        accessorKey: "source_url",
        header: () => colHeader("source_url"),
        cell: ({ row }) => (
          <EditableCell
            value={row.original.source_url}
            onSave={(v) => patchJob(row.original.id, { source_url: v }).then(() => onRefresh())}
          />
        ),
      },
      {
        id: "notes",
        header: () => colHeader("notes"),
        cell: ({ row }) => <NotesCell job={row.original} onUpdated={onRefresh} />,
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
    [allTags, columnSearch, columnIn, sort, onRefresh],
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

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border bg-card text-sm text-muted-foreground">
        Loading job history…
      </div>
    );
  }

  return (
    <>
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
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] border-collapse text-sm">
              <thead>{headerRow(true)}</thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {table.getRowModel().rows.map((row) => (
                    <motion.tr
                      key={row.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.18 }}
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
    </>
  );
}
