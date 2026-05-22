import type { JobSortField } from "@jbhm/shared";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { COLUMN_LABELS } from "@/lib/column-controls";

type Props = {
  open: boolean;
  field: JobSortField;
  value: string;
  onClose: () => void;
  onApply: (value: string) => void;
};

export function ColumnSearchDialog({ open, field, value, onClose, onApply }: Props) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const placeholder =
    field === "resume" || field === "jd"
      ? "yes / no / text…"
      : field === "captured_at"
        ? "e.g. 2025-05"
        : "Search text…";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm gap-3">
        <DialogHeader>
          <DialogTitle className="text-base">Search — {COLUMN_LABELS[field]}</DialogTitle>
        </DialogHeader>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => e.key === "Enter" && (onApply(draft.trim()), onClose())}
          autoFocus
        />
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDraft("");
              onApply("");
              onClose();
            }}
          >
            Clear
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onApply(draft.trim());
              onClose();
            }}
          >
            Search
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
