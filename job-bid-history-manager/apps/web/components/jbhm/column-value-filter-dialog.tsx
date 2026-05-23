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
import { fetchColumnValues } from "@/lib/api/client";
import { COLUMN_LABELS } from "@/lib/jbhm/column-controls";

/** Load distinct values for this column without applying this column's own filter. */
function contextExcludingField(
  listContext: JobFilters,
  field: JobFilterableField,
): JobFilters {
  const column_in = { ...listContext.column_in };
  delete column_in[field];
  const column_search = { ...listContext.column_search };
  delete column_search[field as keyof typeof column_search];

  const next: JobFilters = { ...listContext };
  if (Object.keys(column_in).length) next.column_in = column_in;
  else delete next.column_in;
  if (Object.keys(column_search).length) next.column_search = column_search;
  else delete next.column_search;
  return next;
}

function selectionStateFromApplied(
  options: { value: string; count: number }[],
  selected: string[] | undefined,
): { allChecked: boolean; draft: Set<string> } {
  if (!selected?.length) {
    return { allChecked: true, draft: new Set() };
  }
  const optionValues = options.map((o) => o.value);
  const draft = new Set(selected);
  const everyOptionSelected =
    optionValues.length > 0 && optionValues.every((v) => draft.has(v));
  if (everyOptionSelected) {
    return { allChecked: true, draft: new Set() };
  }
  return { allChecked: false, draft };
}

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

  const valuesContext = useMemo(
    () => contextExcludingField(listContext, field),
    [listContext, field],
  );

  const selectedKey = selected?.join("\0") ?? "";

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void fetchColumnValues(field, valuesContext)
      .then((res) => {
        const byValue = new Map(res.values.map((o) => [o.value, o.count]));
        for (const v of selected ?? []) {
          if (!byValue.has(v)) byValue.set(v, 0);
        }
        const merged = [...byValue.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

        const { allChecked: all, draft: nextDraft } = selectionStateFromApplied(
          merged,
          selected,
        );
        setOptions(merged);
        setAllChecked(all);
        setDraft(nextDraft);
      })
      .catch(() => {
        setOptions([]);
        setAllChecked(true);
        setDraft(new Set());
      })
      .finally(() => setLoading(false));
  }, [open, field, valuesContext, selectedKey]);

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
    <Dialog open={open} onOpenChange={(v: boolean) => !v && onClose()}>
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
              <Checkbox
                checked={allChecked}
                onCheckedChange={(v: boolean | "indeterminate") => toggleAll(!!v)}
              />
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
                  onCheckedChange={(v: boolean | "indeterminate") =>
                    toggleValue(opt.value, !!v)
                  }
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
