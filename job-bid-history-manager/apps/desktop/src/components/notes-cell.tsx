import type { JobListItem } from "@jbhm/shared";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { patchJob } from "@/lib/api";
import { truncate } from "@/lib/utils";

type Props = {
  job: JobListItem;
  onUpdated: () => void;
};

export function NotesCell({ job, onUpdated }: Props) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(job.notes ?? "");
  const [saving, setSaving] = useState(false);

  const openEditor = () => {
    setBody(job.notes ?? "");
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await patchJob(job.id, { notes: body });
      onUpdated();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="max-w-[140px] truncate text-left text-xs text-muted-foreground hover:text-foreground hover:underline"
        onClick={openEditor}
      >
        {job.notes_preview ? truncate(job.notes_preview, 40) : "Add notes…"}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Notes</DialogTitle>
          </DialogHeader>
          <textarea
            className="min-h-[160px] w-full rounded-lg border bg-background p-3 text-sm"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Applied via LinkedIn, follow-up Monday…"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
