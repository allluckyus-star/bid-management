import type { Tag } from "@jbhm/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Props = {
  tags: Tag[];
};

export function TagManagerDialog({ tags }: Props) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Job tags
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Fixed job tags</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Tags are set automatically from the job description (location and full/part time).
          You can toggle them per row. Only one tag per group: remote, onsite, hybrid — and
          full-time or part-time.
        </p>
        <ul className="space-y-2">
          {tags.map((tag) => (
            <li
              key={tag.id}
              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: tag.color ?? "#64748b" }}
              />
              {tag.name}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
