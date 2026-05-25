"use client";

import type { JobListItem, Tag } from "@jbhm/shared";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { addTagToJob, removeTagFromJob } from "@/lib/api/client";
import { notifyActionSuccess, notifyLoadError } from "@/lib/jbhm/notify";

type Props = {
  job: JobListItem | null;
  allTags: Tag[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
};

export function JobTagsDialog({ job, allTags, open, onOpenChange, onUpdated }: Props) {
  const [busy, setBusy] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (open && job) {
      setPendingIds(new Set(job.tags.map((t) => t.id)));
    }
  }, [open, job?.id, job?.tags]);

  const sortedTags = useMemo(
    () =>
      [...allTags].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [allTags],
  );

  const toggleTag = async (tagId: string, checked: boolean) => {
    if (!job) return;
    setBusy(true);
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(tagId);
      else next.delete(tagId);
      return next;
    });
    try {
      if (checked) {
        await addTagToJob(job.id, tagId);
      } else {
        await removeTagFromJob(job.id, tagId);
      }
      notifyActionSuccess(checked ? "Tag added" : "Tag removed");
      onUpdated();
    } catch (e) {
      if (job) {
        setPendingIds(new Set(job.tags.map((t) => t.id)));
      }
      notifyLoadError(e instanceof Error ? e.message : "Could not update tags");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(80vh,520px)] max-w-md flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Tags for this job</DialogTitle>
        </DialogHeader>
        {!job ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : sortedTags.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tags in the system yet. Add tags from the dashboard tag manager.
          </p>
        ) : (
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {sortedTags.map((tag) => {
              const checked = pendingIds.has(tag.id);
              return (
                <li key={tag.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/60">
                    <Checkbox
                      checked={checked}
                      disabled={busy}
                      onCheckedChange={(v: boolean | "indeterminate") => {
                        void toggleTag(tag.id, v === true);
                      }}
                    />
                    <span className="flex-1 text-sm">{tag.name}</span>
                    {tag.color ? (
                      <span
                        className="h-3 w-3 shrink-0 rounded-full border"
                        style={{ backgroundColor: tag.color }}
                        aria-hidden
                      />
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
