"use client";

import type { RowSelectionState } from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDashboardFilters } from "@/components/dashboard/dashboard-filters-context";
import { JobsTable } from "@/components/jbhm/jobs-table";
import { TablePagination } from "@/components/jbhm/table-pagination";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { useInteractionHold } from "@/hooks/use-interaction-hold";
import {
  useDashboardSummaryQuery,
  useInvalidateDashboard,
  useJobsQuery,
  useTagsQuery,
} from "@/hooks/use-dashboard-queries";
import { useTeamId } from "@/context/team-context";
import { bulkDeleteJobs } from "@/lib/api/client";
import {
  notifyActionSuccess,
  notifyAfterLoad,
  notifyLoadError,
  type LoadReason,
} from "@/lib/jbhm/notify";

type Props = {
  interactionHeld: boolean;
  setInteractionHold: (key: string, active: boolean) => void;
};

export function JobsTableSection({ interactionHeld, setInteractionHold }: Props) {
  const teamId = useTeamId();
  const {
    filters,
    setFilters,
    apiFilters,
    listContext,
    filterKey,
    pageKey,
    handleColumnSearchChange,
    handleColumnInChange,
    handleSortChange,
    consumeFiltersCleared,
  } = useDashboardFilters();

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [deleting, setDeleting] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const filterKeyRef = useRef(filterKey);
  const pageKeyRef = useRef(pageKey);
  const isFirstLoadRef = useRef(true);
  const boardTotalRef = useRef<number | null>(null);

  const invalidate = useInvalidateDashboard();
  const invalidateRef = useRef(invalidate);
  invalidateRef.current = invalidate;

  const handleRefresh = useCallback(() => {
    void invalidateRef.current.jobs();
    void invalidateRef.current.summary();
    void invalidateRef.current.timeline();
  }, []);
  const jobsQuery = useJobsQuery(apiFilters, { paused: interactionHeld, pollMs: 45_000 });
  const summaryQuery = useDashboardSummaryQuery({ paused: interactionHeld });
  const tagsQuery = useTagsQuery();

  const jobs = jobsQuery.data?.items ?? [];
  const total = jobsQuery.data?.total ?? 0;


  useEffect(() => {
    if (!jobsQuery.isSuccess) return;

    let reason: LoadReason = "filter";
    if (isFirstLoadRef.current) {
      reason = "initial";
      isFirstLoadRef.current = false;
    } else if (filterKey !== filterKeyRef.current) {
      reason = "filter";
    } else if (pageKey !== pageKeyRef.current) {
      reason = "page";
    } else if (jobsQuery.isFetching && !jobsQuery.isLoading) {
      reason = "poll";
    } else {
      return;
    }

    filterKeyRef.current = filterKey;
    pageKeyRef.current = pageKey;

    const prevBoard = boardTotalRef.current;
    const boardTotal = summaryQuery.data?.total_bids;
    if (boardTotal != null) boardTotalRef.current = boardTotal;

    const newBoardBids =
      reason === "poll" && prevBoard != null && boardTotal != null && boardTotal > prevBoard
        ? boardTotal - prevBoard
        : 0;

    notifyAfterLoad({
      reason,
      filters,
      total,
      page: filters.page ?? 1,
      newBoardBids,
      cleared: consumeFiltersCleared(),
    });
  }, [
    jobsQuery.isSuccess,
    jobsQuery.isFetching,
    jobsQuery.isLoading,
    filterKey,
    pageKey,
    filters,
    total,
    summaryQuery.data?.total_bids,
    consumeFiltersCleared,
  ]);

  useEffect(() => {
    if (jobsQuery.isError) {
      const msg =
        jobsQuery.error instanceof Error ? jobsQuery.error.message : "Failed to load jobs";
      notifyLoadError(msg);
    }
  }, [jobsQuery.isError, jobsQuery.error]);

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);

  const runDelete = async (jobIds: string[]) => {
    if (!jobIds.length) return;
    const res = await bulkDeleteJobs(teamId, jobIds);
    if (res.deleted_count === 0) {
      throw new Error("No rows were deleted. You may need to sign in again.");
    }
    setRowSelection((prev) => {
      const next = { ...prev };
      for (const id of jobIds) delete next[id];
      return next;
    });
    await invalidate.jobs();
    await invalidate.summary();
    await invalidate.timeline();
    return res.deleted_count;
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return;
    const ok = await confirm({
      title: `Delete ${selectedIds.length} selected job${selectedIds.length === 1 ? "" : "s"}?`,
      description: "They will be removed from the team board.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      variant: "destructive",
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const n = await runDelete(selectedIds);
      notifyActionSuccess(`Deleted ${n} job${n === 1 ? "" : "s"}`);
    } catch (err) {
      notifyLoadError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteOne = async (jobId: string) => {
    const ok = await confirm({
      title: "Delete this job?",
      description: "It will be removed from the team board.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      variant: "destructive",
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const n = await runDelete([jobId]);
      notifyActionSuccess(`Deleted ${n} job`);
    } catch (err) {
      notifyLoadError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {confirmDialog}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          Page {filters.page ?? 1}: {jobs.length} rows · {total} total
          {selectedIds.length > 0 && ` · ${selectedIds.length} selected`}
          {jobsQuery.isFetching && !jobsQuery.isLoading ? " · updating…" : ""}
          {selectedIds.length === 0 && (
            <span className="text-muted-foreground/80">
              {" "}
              · Select rows (left checkbox) or use Delete on a row
            </span>
          )}
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
        allTags={tagsQuery.data ?? []}
        loading={jobsQuery.isLoading}
        rowSelection={rowSelection}
        columnSearch={filters.column_search ?? {}}
        columnIn={filters.column_in ?? {}}
        sort={filters.sort ?? [{ field: "captured_at", dir: "desc" }]}
        listContext={listContext}
        onColumnSearchChange={handleColumnSearchChange}
        onColumnInChange={handleColumnInChange}
        onSortChange={handleSortChange}
        onRowSelectionChange={setRowSelection}
        onDeleteJob={handleDeleteOne}
        deleteBusy={deleting}
        onRefresh={handleRefresh}
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
    </>
  );
}
