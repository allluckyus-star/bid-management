"use client";

import { FileText, Star, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  deleteLibraryResume,
  fetchResumeLibrary,
  setLibraryResumeDefault,
  uploadLibraryResume,
  type LibraryResumeItem,
} from "@/lib/api/client";
import { notifyActionSuccess, notifyLoadError } from "@/lib/jbhm/notify";

export function TeamResumesPage({ teamId }: { teamId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<LibraryResumeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchResumeLibrary(teamId);
      setItems(res.items);
    } catch (e) {
      notifyLoadError(e instanceof Error ? e.message : "Failed to load resumes");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleUpload = async (file: File | undefined, setDefault: boolean) => {
    if (!file) return;
    setBusy(true);
    try {
      await uploadLibraryResume(teamId, file, setDefault);
      notifyActionSuccess("Resume uploaded");
      await refresh();
    } catch (e) {
      notifyLoadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleSetDefault = async (id: string) => {
    setBusy(true);
    try {
      await setLibraryResumeDefault(teamId, id);
      notifyActionSuccess("Default resume updated");
      await refresh();
    } catch (e) {
      notifyLoadError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    setBusy(true);
    try {
      await deleteLibraryResume(teamId, id);
      notifyActionSuccess("Resume removed");
      await refresh();
    } catch (e) {
      notifyLoadError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Resume library</h1>
          <p className="text-sm text-muted-foreground">
            Upload original resumes for ChatGPT optimization. Set one as default.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/team/${teamId}/dashboard`}>Back to dashboard</Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".docx"
          className="hidden"
          onChange={(e) => void handleUpload(e.target.files?.[0], items.length === 0)}
        />
        <Button disabled={busy} onClick={() => inputRef.current?.click()}>
          <Upload className="mr-2 h-4 w-4" />
          Upload .docx
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No resumes yet. Upload your master resume to use with job-specific ChatGPT prompts.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.original_filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.is_default ? "Default" : "Library"} ·{" "}
                    {new Date(item.uploaded_at).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {!item.is_default && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void handleSetDefault(item.id)}
                  >
                    <Star className="mr-1 h-3 w-3" />
                    Set default
                  </Button>
                )}
                {!item.is_default && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void handleDelete(item.id)}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    Remove
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
