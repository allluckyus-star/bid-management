import type { JobListItem } from "@jbhm/shared";
import { truncate } from "@/lib/utils";

type Props = {
  job: JobListItem;
  onOpenNotes: (job: JobListItem) => void;
};

export function NotesCell({ job, onOpenNotes }: Props) {
  return (
    <button
      type="button"
      className="max-w-[140px] truncate text-left text-xs text-muted-foreground hover:text-foreground hover:underline"
      onClick={() => onOpenNotes(job)}
    >
      {job.notes_preview ? truncate(job.notes_preview, 40) : "Add notes…"}
    </button>
  );
}
