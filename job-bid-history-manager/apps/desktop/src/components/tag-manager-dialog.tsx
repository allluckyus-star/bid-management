import type { Tag } from "@jbhm/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createTag, deleteTag, updateTag } from "@/lib/api";

type Props = {
  tags: Tag[];
  onUpdated: () => void;
};

export function TagManagerDialog({ tags, onUpdated }: Props) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createTag({ name: newName.trim() });
      setNewName("");
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create tag");
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (tag: Tag) => {
    if (!editName.trim() || editName === tag.name) {
      setEditingId(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateTag(tag.id, { name: editName.trim() });
      setEditingId(null);
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to rename tag");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (tag: Tag) => {
    if (!confirm(`Delete tag "${tag.name}" globally from all jobs?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteTag(tag.id);
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete tag");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Manage tags
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Global tag manager</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Rename or delete tags across all jobs. Add new tags here or per row.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <Input
            placeholder="New tag name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
          />
          <Button onClick={() => void handleCreate()} disabled={busy}>
            Add
          </Button>
        </div>
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {tags.map((tag) => (
            <li
              key={tag.id}
              className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
            >
              {editingId === tag.id ? (
                <Input
                  className="h-8"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleRename(tag)}
                />
              ) : (
                <span className="flex items-center gap-2 text-sm">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: tag.color ?? "#64748b" }}
                  />
                  {tag.name}
                </span>
              )}
              <div className="flex gap-1">
                {editingId === tag.id ? (
                  <Button size="sm" variant="secondary" onClick={() => void handleRename(tag)}>
                    Save
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(tag.id);
                      setEditName(tag.name);
                    }}
                  >
                    Rename
                  </Button>
                )}
                <Button size="sm" variant="destructive" onClick={() => void handleDelete(tag)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
