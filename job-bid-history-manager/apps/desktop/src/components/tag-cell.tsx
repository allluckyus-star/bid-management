import type { JobListItem, Tag } from "@jbhm/shared";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { addTagToJob, createTag, removeTagFromJob } from "@/lib/api";

type Props = {
  job: JobListItem;
  allTags: Tag[];
  onUpdated: () => void;
};

export function TagCell({ job, allTags, onUpdated }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const jobTagIds = new Set(job.tags.map((t) => t.id));
  const available = allTags.filter((t) => !jobTagIds.has(t.id));

  const handleAdd = async (tagId: string) => {
    setBusy(true);
    try {
      await addTagToJob(job.id, tagId);
      onUpdated();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateAndAdd = async (name: string) => {
    setBusy(true);
    try {
      const tag = await createTag({ name });
      await addTagToJob(job.id, tag.id);
      onUpdated();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (tagId: string) => {
    setBusy(true);
    try {
      await removeTagFromJob(job.id, tagId);
      onUpdated();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex max-w-[200px] flex-wrap items-center gap-1">
      {job.tags.map((tag) => (
        <Badge
          key={tag.id}
          variant="secondary"
          className="gap-0.5 pr-1 text-[10px]"
          style={tag.color ? { backgroundColor: tag.color, color: "#fff" } : undefined}
        >
          {tag.name}
          <button
            type="button"
            className="ml-0.5 rounded hover:bg-black/10"
            onClick={() => void handleRemove(tag.id)}
            disabled={busy}
            aria-label={`Remove ${tag.name}`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
      >
        <Plus className="h-3 w-3" />
      </Button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[140px] rounded-lg border bg-card p-2 shadow-lg">
          {available.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">No more tags</p>
          ) : (
            available.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-muted"
                onClick={() => void handleAdd(tag.id)}
              >
                {tag.name}
              </button>
            ))
          )}
          <form
            className="mt-2 flex gap-1 border-t pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const name = String(fd.get("tagName") ?? "").trim();
              if (name) void handleCreateAndAdd(name);
            }}
          >
            <input
              name="tagName"
              className="h-7 flex-1 rounded border px-2 text-xs"
              placeholder="New tag"
            />
            <Button type="submit" size="sm" className="h-7 px-2 text-xs">
              +
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
