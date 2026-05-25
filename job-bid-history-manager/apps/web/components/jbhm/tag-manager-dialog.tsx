"use client";

import type { Tag } from "@jbhm/shared";
import { Plus, Tags, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTeamId } from "@/context/team-context";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { useInvalidateDashboard } from "@/hooks/use-dashboard-queries";
import { createTag, deleteTag } from "@/lib/api/client";
import { notifyActionSuccess, notifyLoadError } from "@/lib/jbhm/notify";

type Props = {
  tags: Tag[];
};

/** Team-wide tag library: create tags that appear in each job row’s + picker. */
export function TagManagerDialog({ tags }: Props) {
  const teamId = useTeamId();
  const invalidate = useInvalidateDashboard();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newTagName, setNewTagName] = useState("");

  const sortedTags = useMemo(
    () =>
      [...tags].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [tags],
  );

  const handleRemove = async (tag: Tag) => {
    const ok = await confirm({
      title: `Remove tag "${tag.name}"?`,
      description:
        "This removes the tag from the team library and unlinks it from all jobs. You can add it again later.",
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteTag(teamId, tag.id);
      await invalidate.all();
      notifyActionSuccess("Tag removed from team and all jobs");
    } catch (e) {
      notifyLoadError(e instanceof Error ? e.message : "Could not remove tag");
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    const name = newTagName.trim().toLowerCase();
    if (!name) return;
    setBusy(true);
    try {
      await createTag(teamId, { name });
      await invalidate.tags();
      setNewTagName("");
      notifyActionSuccess("Tag added to team library");
    } catch (e) {
      notifyLoadError(e instanceof Error ? e.message : "Could not create tag");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Tags className="mr-1 h-4 w-4" />
          Manage tags
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        {confirmDialog}
        <DialogHeader>
          <DialogTitle>Team tag library</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Add or remove tags for your team. Use the <strong>+</strong> button in a job’s Tags column
          to assign them to that row.
        </p>

        <div className="flex gap-2">
          <Input
            placeholder="New tag name"
            value={newTagName}
            disabled={busy}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
            }}
          />
          <Button type="button" size="sm" disabled={busy || !newTagName.trim()} onClick={() => void handleCreate()}>
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        </div>

        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {sortedTags.length === 0 ? (
            <li className="text-sm text-muted-foreground">No tags yet. Add one above.</li>
          ) : (
            sortedTags.map((tag) => (
              <li
                key={tag.id}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: tag.color ?? "#64748b" }}
                />
                <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 shrink-0 p-0 text-destructive hover:text-destructive"
                  disabled={busy}
                  aria-label={`Remove tag ${tag.name}`}
                  onClick={() => void handleRemove(tag)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
