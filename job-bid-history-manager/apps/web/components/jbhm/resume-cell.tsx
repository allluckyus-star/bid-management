import type { JobListItem } from "@jbhm/shared";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { resumeDownloadUrl, unlinkJobResume, uploadJobResume } from "@/lib/api/client";
import { truncate } from "@/lib/utils";

type Props = {
  job: JobListItem;
  busy: boolean;
  onUpdated: () => void;
  onPreview: (job: JobListItem) => void;
};

export function ResumeCell({ job, busy, onUpdated, onPreview }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const pickFile = () => inputRef.current?.click();

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".docx")) {
      alert("Only .docx files are allowed.");
      return;
    }
    try {
      await uploadJobResume(job.id, file);
      onUpdated();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload failed");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleUnlink = async () => {
    if (!confirm("Unlink resume from this job?")) return;
    try {
      await unlinkJobResume(job.id);
      onUpdated();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Unlink failed");
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
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={busy}
          onClick={pickFile}
        >
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
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" disabled={busy} onClick={pickFile}>
            Replace
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" disabled={busy} onClick={() => void handleUnlink()}>
            Unlink
          </Button>
        </div>
      </div>
    </>
  );
}
