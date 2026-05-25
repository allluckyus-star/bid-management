import type { JobListItem } from "@jbhm/shared";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Props = {
  job: JobListItem;
  onManageTags: (jobId: string) => void;
  tagsAvailable: boolean;
};

export function TagCell({ job, onManageTags, tagsAvailable }: Props) {
  return (
    <div className="mx-auto flex max-w-[220px] flex-wrap items-center justify-center gap-1">
      {job.tags.map((tag) => (
        <Badge
          key={tag.id}
          variant="secondary"
          className="text-[10px]"
          style={tag.color ? { backgroundColor: tag.color, color: "#fff" } : undefined}
        >
          {tag.name}
        </Badge>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="relative z-10 h-6 w-6 p-0"
        disabled={!tagsAvailable}
        aria-label="Add or remove tags on this job"
        title={tagsAvailable ? "Add or remove tags" : "No tags defined — use Manage tags above the table"}
        onClick={(e) => {
          e.stopPropagation();
          onManageTags(job.id);
        }}
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}
