import type { JobFilterableField, JobFilters } from "@jbhm/shared";
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
import { fetchColumnValues } from "@/lib/api";
import { COLUMN_LABELS } from "@/lib/column-controls";

type Props = {
  open: boolean;
  field: JobFilterableField;
  selected: string[] | undefined;
  listContext: JobFilters;
  onClose: () => void;
  onApply: (values: string[] | undefined) => void;
};

export function ColumnValueFilterDialog({
  open,
  field,
  selected,
  listContext,
  onClose,
  onApply,
}: Props) {
  const [options, setOptions] = useState<{ value: string; count: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [allChecked, setAllChecked] = useState(true);

  useEffect(() => {
    if (!open) return;
    const initial = selected?.length ? new Set(selected) : null;
    setAllChecked(!initial);
    setDraft(initial ?? new Set());
    setLoading(true);
    void fetchColumnValues(field, listContext)
      .then((res) => setOptions(res.values))
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }, [open, field, selected, listContext]);

  const totalCount = useMemo(() => options.reduce((s, o) => s + o.count, 0), [options]);

  const toggleAll = (checked: boolean) => {
    setAllChecked(checked);
    if (checked) setDraft(new Set());
    else setDraft(new Set(options.map((o) => o.value)));
  };

  const toggleValue = (value: string, checked: boolean) => {
    setAllChecked(false);
    const next = new Set(draft);
    if (checked) next.add(value);
    else next.delete(value);
    if (next.size === 0) {
      setAllChecked(true);
      setDraft(new Set());
    } else {
      setDraft(next);
    }
  };

  const handleApply = () => {
    if (allChecked || draft.size === 0) onApply(undefined);
    else onApply([...draft]);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm gap-3">
        <DialogHeader>
          <DialogTitle className="text-base">Filter — {COLUMN_LABELS[field]}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading values…</p>
        ) : options.length === 0 ? (
          <p className="text-sm text-muted-foreground">No values in current data.</p>
        ) : (
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-input px-2 py-1.5 text-sm font-medium">
              <Checkbox checked={allChecked} onCheckedChange={(v) => toggleAll(!!v)} />
              <span>(All)</span>
              <span className="ml-auto text-xs text-muted-foreground">{totalCount}</span>
            </label>
            {options.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted/50"
              >
                <Checkbox
                  checked={allChecked || draft.has(opt.value)}
                  disabled={allChecked}
                  onCheckedChange={(v) => toggleValue(opt.value, !!v)}
                />
                <span className="truncate">{opt.value}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{opt.count}</span>
              </label>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleApply}>
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
