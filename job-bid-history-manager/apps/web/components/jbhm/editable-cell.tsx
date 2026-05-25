"use client";

import { useEffect, useRef, useState } from "react";
import type { TableEditField } from "@/context/table-cell-edit";
import { useTableCellEdit } from "@/context/table-cell-edit";
import { useTableInteraction } from "@/context/table-interaction";
import { cn } from "@/lib/utils";

type Props = {
  cellKey: string;
  jobId: string;
  field: TableEditField;
  value: string | null | undefined;
  onSave: (value: string) => Promise<void>;
  className?: string;
};

export function EditableCell({
  cellKey,
  jobId,
  field,
  value,
  onSave,
  className,
}: Props) {
  const { edit, setEdit } = useTableCellEdit();
  const { setHold } = useTableInteraction();
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const active = edit?.key === cellKey;

  useEffect(() => {
    setHold(cellKey, active);
    return () => setHold(cellKey, false);
  }, [active, cellKey, setHold]);

  useEffect(() => {
    if (active) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [active]);

  const startEditing = () => {
    setEdit({
      key: cellKey,
      jobId,
      field,
      draft: value ?? "",
    });
  };

  const cancelEditing = () => {
    setEdit(null);
  };

  const commit = async () => {
    if (!active || !edit || saving) return;
    if (edit.draft === (value ?? "")) {
      setEdit(null);
      return;
    }
    setSaving(true);
    try {
      await onSave(edit.draft);
      setEdit(null);
    } catch {
      /* keep editing; parent toast */
    } finally {
      setSaving(false);
    }
  };

  if (active && edit) {
    return (
      <div className="flex min-w-[120px] items-center gap-1">
        <input
          ref={inputRef}
          className={cn(
            "h-8 min-w-0 flex-1 rounded border bg-background px-2 text-xs",
            className,
          )}
          value={edit.draft}
          disabled={saving}
          onChange={(e) =>
            setEdit({ ...edit, draft: e.target.value })
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commit();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancelEditing();
            }
          }}
        />
        <button
          type="button"
          className="shrink-0 text-[10px] font-medium text-primary hover:underline disabled:opacity-50"
          disabled={saving}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void commit()}
        >
          Save
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={cn(
        "max-w-[180px] truncate text-left text-xs hover:underline",
        !value && "text-muted-foreground",
        className,
      )}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        startEditing();
      }}
      title={value ?? "Click to edit"}
    >
      {value || "—"}
    </button>
  );
}
