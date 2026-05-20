import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  value: string | null | undefined;
  onSave: (value: string) => Promise<void>;
  className?: string;
};

export function EditableCell({ value, onSave, className }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

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
        onBlur={() => void commit()}
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
      onClick={() => setEditing(true)}
      title={value ?? "Click to edit"}
    >
      {value || "—"}
    </button>
  );
}
