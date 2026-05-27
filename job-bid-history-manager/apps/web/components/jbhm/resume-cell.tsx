"use client";

import type { JobListItem } from "@jbhm/shared";
import { Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { CopyTextButton } from "@/components/jbhm/copy-text-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTeamId } from "@/context/team-context";
import {
  createResumeOptimization,
  resumeDownloadUrl,
  savePendingOptimization,
  unlinkJobResume,
  uploadJobResume,
} from "@/lib/api/client";
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
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [optimizing, setOptimizing] = useState(false);

  const pickFile = () => inputRef.current?.click();

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".docx")) {
      notifyLoadError("Only .docx files are allowed.");
      return;
    }
    try {
      await uploadJobResume(teamId, job.id, file);
      notifyActionSuccess("Resume uploaded");
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
      notifyActionSuccess("Resume unlinked");
      onUpdated();
    } catch (e) {
      notifyLoadError(e instanceof Error ? e.message : "Unlink failed");
    }
  };

  const handleGeneratePrompt = async () => {
    if (!job.has_jd) {
      notifyLoadError("Capture the job page first so a cleaned JD is available.");
      return;
    }
    setOptimizing(true);
    try {
      const result = await createResumeOptimization(teamId, job.id);
      setPromptText(result.prompt_text);
      savePendingOptimization({
        teamId,
        jobId: job.id,
        optimizationId: result.optimization_id,
        promptText: result.prompt_text,
      });
      setPromptOpen(true);
      notifyActionSuccess("Prompt ready — use extension or copy below");
    } catch (e) {
      notifyLoadError(e instanceof Error ? e.message : "Could not create prompt");
    } finally {
      setOptimizing(false);
    }
  };

  return (
    <>
      <div className="flex flex-col items-center gap-1">
        <input
          ref={inputRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />

        <Button
          variant="secondary"
          size="sm"
          className="h-7 text-[10px]"
          disabled={busy || optimizing}
          onClick={() => void handleGeneratePrompt()}
        >
          <Sparkles className="mr-1 h-3 w-3" />
          ChatGPT Prompt
        </Button>

        {!job.resume ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={busy}
            onClick={pickFile}
          >
            Attach Resume
          </Button>
        ) : (
          <>
            <span className="text-center text-xs font-medium">
              {truncate(job.resume.original_filename, 28)}
            </span>
            <div className="flex flex-wrap justify-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[10px]"
                disabled={busy}
                onClick={() => onPreview(job)}
              >
                Preview
              </Button>
              <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" asChild>
                <a href={resumeDownloadUrl(job.resume.id)} download={job.resume.original_filename}>
                  Download
                </a>
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
                Unlink
              </Button>
            </div>
          </>
        )}
      </div>

      <Dialog open={promptOpen} onOpenChange={setPromptOpen}>
        <DialogContent
          className="max-h-[85vh] max-w-2xl overflow-y-auto"
          topActions={<CopyTextButton text={promptText} title="Copy prompt" />}
        >
          <DialogHeader className="pr-[4.75rem]">
            <DialogTitle>ChatGPT optimization prompt</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Copy this prompt or use the extension: ChatGPT Prompt (Alt+W) → auto capture.
            </p>
          </DialogHeader>
          <textarea
            readOnly
            className="min-h-[240px] w-full rounded-md border bg-muted/30 p-3 font-mono text-xs"
            value={promptText}
          />
          <DialogFooter>
            <Button onClick={() => setPromptOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
