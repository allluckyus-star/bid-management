import { useEffect, useState } from "react";
import { useTableInteraction } from "@/context/table-interaction";
import { cn } from "@/lib/utils";

type Props = {
  value: string | null | undefined;
  onSave: (value: string) => Promise<void>;
  holdKey: string;
  className?: string;
};

export function EditableCell({ value, onSave, holdKey, className }: Props) {
  const { setHold } = useTableInteraction();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setHold(holdKey, editing);
    return () => setHold(holdKey, false);
  }, [editing, holdKey, setHold]);

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  const commit = async () => {
    if (draft === (value ?? "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <input
        className={cn(
          "h-8 w-full min-w-[100px] rounded border bg-background px-2 text-xs",
          className,
        )}
        value={draft}
        disabled={saving}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          window.setTimeout(() => void commit(), 0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") void commit();
          if (e.key === "Escape") {
            setDraft(value ?? "");
            setEditing(false);
          }
        }}
      />
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
      onClick={() => setEditing(true)}
      title={value ?? "Click to edit"}
    >
      {value || "—"}
    </button>
  );
}
