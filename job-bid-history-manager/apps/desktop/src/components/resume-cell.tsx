import type { JobListItem } from "@jbhm/shared";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TextPreviewDialog } from "@/components/text-preview-dialog";
import {
  fetchResumePreview,
  resumeDownloadUrl,
  unlinkJobResume,
  uploadJobResume,
} from "@/lib/api";
import { truncate } from "@/lib/utils";

type Props = {
  job: JobListItem;
  onUpdated: () => void;
};

export function ResumeCell({ job, onUpdated }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewText, setPreviewText] = useState("");
  const [busy, setBusy] = useState(false);

  const pickFile = () => inputRef.current?.click();

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".docx")) {
      alert("Only .docx files are allowed.");
      return;
    }
    setBusy(true);
    try {
      await uploadJobResume(job.id, file);
      onUpdated();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handlePreview = async () => {
    if (!job.resume) return;
    setBusy(true);
    try {
      const text = await fetchResumePreview(job.resume.id);
      setPreviewText(text);
      setPreviewOpen(true);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  };

  const handleUnlink = async () => {
    if (!confirm("Unlink resume from this job?")) return;
    setBusy(true);
    try {
      await unlinkJobResume(job.id);
      onUpdated();
    } finally {
      setBusy(false);
    }
  };

  if (!job.resume) {
    return (
      <>
        <input
          ref={inputRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={busy} onClick={pickFile}>
          Attach Resume
        </Button>
      </>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".docx"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium">{truncate(job.resume.original_filename, 22)}</span>
        <div className="flex flex-wrap gap-1">
          <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" disabled={busy} onClick={() => void handlePreview()}>
            Preview
          </Button>
          <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" asChild>
            <a href={resumeDownloadUrl(job.resume.id)} download={job.resume.original_filename}>
              Download
            </a>
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" disabled={busy} onClick={pickFile}>
            Replace
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" disabled={busy} onClick={() => void handleUnlink()}>
            Unlink
          </Button>
        </div>
      </div>
      <TextPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={`Resume — ${job.resume.original_filename}`}
        primary={previewText}
      />
    </>
  );
}
