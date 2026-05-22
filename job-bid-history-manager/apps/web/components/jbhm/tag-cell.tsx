import type { JobListItem, Tag } from "@jbhm/shared";
import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTableInteraction } from "@/context/table-interaction";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { addTagToJob, removeTagFromJob } from "@/lib/api/client";

const LOCATION_TAGS = new Set(["remote", "onsite", "hybrid"]);
const EMPLOYMENT_TAGS = new Set(["full-time", "part-time"]);

type Props = {
  job: JobListItem;
  allTags: Tag[];
  holdKey: string;
  onUpdated: () => void;
};

export function TagCell({ job, allTags, holdKey, onUpdated }: Props) {
  const { setHold } = useTableInteraction();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setHold(holdKey, open);
    return () => setHold(holdKey, false);
  }, [open, holdKey, setHold]);

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

  const handleRemove = async (tagId: string) => {
    setBusy(true);
    try {
      await removeTagFromJob(job.id, tagId);
      onUpdated();
    } finally {
      setBusy(false);
    }
  };

  const groupTags = (names: Set<string>) =>
    allTags.filter((t) => names.has(t.name.toLowerCase()));

  return (
    <div className="relative flex max-w-[220px] flex-wrap items-center gap-1">
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
      {available.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => setOpen((v) => !v)}
          disabled={busy}
          aria-label="Add tag"
        >
          <Plus className="h-3 w-3" />
        </Button>
      )}
      {open && available.length > 0 && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[160px] rounded-lg border bg-card p-2 text-xs shadow-lg">
          <p className="px-2 py-0.5 font-medium text-muted-foreground">Location</p>
          {groupTags(LOCATION_TAGS)
            .filter((t) => !jobTagIds.has(t.id))
            .map((tag) => (
              <button
                key={tag.id}
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted"
                onClick={() => void handleAdd(tag.id)}
              >
                {tag.name}
              </button>
            ))}
          <p className="mt-1 border-t px-2 py-0.5 pt-1 font-medium text-muted-foreground">
            Employment
          </p>
          {groupTags(EMPLOYMENT_TAGS)
            .filter((t) => !jobTagIds.has(t.id))
            .map((tag) => (
              <button
                key={tag.id}
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted"
                onClick={() => void handleAdd(tag.id)}
              >
                {tag.name}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
