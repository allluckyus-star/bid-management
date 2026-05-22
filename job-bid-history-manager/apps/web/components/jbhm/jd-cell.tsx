import type { JobListItem } from "@jbhm/shared";
import { Button } from "@/components/ui/button";

type Props = {
  job: JobListItem;
  busy: boolean;
  onViewJd: (job: JobListItem) => void;
};

export function JdCell({ job, busy, onViewJd }: Props) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 px-2 text-xs"
      disabled={!job.has_jd || busy}
      onClick={() => onViewJd(job)}
    >
      View JD
    </Button>
  );
}
