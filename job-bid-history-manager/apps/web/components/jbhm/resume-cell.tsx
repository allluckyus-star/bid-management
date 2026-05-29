"use client";

import type { JobListItem } from "@jbhm/shared";
import { Paperclip } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { useTeamId } from "@/context/team-context";
import {
  resumeDownloadUrl,
  unlinkJobResume,
  uploadJobResume,
} from "@/lib/api/client";
import { downloadResumeWithSubfolder } from "@/lib/jbhm/extension-download";
import { notifyActionSuccess, notifyLoadError } from "@/lib/jbhm/notify";
import { truncate } from "@/lib/utils";

type Props = {
  job: JobListItem;
  busy: boolean;
  onUpdated: () => void;
  onPreview: (job: JobListItem) => void;
};

export function ResumeCell({ job, busy, onUpdated, onPreview }: Props) {
  const teamId = useTeamId();
  const inputRef = useRef<HTMLInputElement>(null);
  const localPath = job.resume_path?.trim() || "";

  const pickFile = () => inputRef.current?.click();

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".docx")) {
      notifyLoadError("Only .docx files are allowed.");
      return;
    }
    try {
      await uploadJobResume(teamId, job.id, file);
      notifyActionSuccess("Resume saved to dashboard");
      onUpdated();
    } catch (e) {
      notifyLoadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleUnlink = async () => {
    try {
      await unlinkJobResume(teamId, job.id);
      notifyActionSuccess("Dashboard resume removed");
      onUpdated();
    } catch (e) {
      notifyLoadError(e instanceof Error ? e.message : "Remove failed");
    }
  };

  const handleDownload = async () => {
    if (!job.resume) return;
    try {
      const result = await downloadResumeWithSubfolder(
        resumeDownloadUrl(teamId, job.resume.id),
        job.resume.original_filename,
      );
      if (result.usedExtension && result.downloadPath) {
        notifyActionSuccess(`Downloaded to ${result.downloadPath}`);
      } else {
        notifyActionSuccess("Download started");
      }
    } catch (e) {
      notifyLoadError(e instanceof Error ? e.message : "Download failed");
    }
  };

  return (
    <div className="flex max-w-[280px] flex-col items-start gap-1.5">
      <input
        ref={inputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      {localPath ? (
        <p
          className="w-full truncate text-[11px] leading-snug text-muted-foreground"
          title={localPath}
        >
          <span className="font-medium text-foreground/80">Local:</span> {localPath}
        </p>
      ) : null}

      {job.resume ? (
        <>
          <p className="text-[11px] font-medium text-foreground">
            Dashboard: {truncate(job.resume.original_filename, 32)}
          </p>
          <div className="flex flex-wrap gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[10px]"
              disabled={busy}
              onClick={() => onPreview(job)}
            >
              Preview
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[10px]"
              disabled={busy}
              onClick={() => void handleDownload()}
            >
              Download
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px]"
              disabled={busy}
              onClick={pickFile}
            >
              Replace
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px]"
              disabled={busy}
              onClick={() => void handleUnlink()}
            >
              Remove
            </Button>
          </div>
        </>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={busy}
          onClick={pickFile}
        >
          <Paperclip className="mr-1 h-3 w-3" />
          Attach to dashboard
        </Button>
      )}

      {job.resume && localPath ? (
        <p className="text-[10px] text-muted-foreground">
          Local DOCX is not auto-uploaded — attach if you want a copy on the server.
        </p>
      ) : !job.resume && localPath ? (
        <p className="text-[10px] text-muted-foreground">
        </p>
      ) : null}
    </div>
  );
}
