import type { JobListItem } from "@jbhm/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextPreviewDialog } from "@/components/text-preview-dialog";
import { fetchJobJd, reextractJobJd } from "@/lib/api";

type Props = {
  job: JobListItem;
  onUpdated: () => void;
};

export function JdCell({ job, onUpdated }: Props) {
  const [open, setOpen] = useState(false);
  const [cleaned, setCleaned] = useState<string | null>(null);
  const [raw, setRaw] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const viewJd = async () => {
    setBusy(true);
    try {
      const jd = await fetchJobJd(job.id);
      setCleaned(jd.cleaned_text ?? jd.raw_text);
      setRaw(jd.raw_text);
      setOpen(true);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to load JD");
    } finally {
      setBusy(false);
    }
  };

  const reextract = async () => {
    setBusy(true);
    try {
      const res = await reextractJobJd(job.id);
      setCleaned(res.jd.cleaned_text ?? res.jd.raw_text);
      setRaw(res.jd.raw_text);
      onUpdated();
      alert("Re-extraction complete. Structured fields updated.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Re-extract failed (is Ollama running?)");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={!job.has_jd || busy}
          onClick={() => void viewJd()}
        >
          View JD
        </Button>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={!job.has_jd || busy} onClick={() => void reextract()}>
          Re-extract
        </Button>
      </div>
      <TextPreviewDialog
        open={open}
        onOpenChange={setOpen}
        title="Job description"
        primary={cleaned}
        secondary={raw}
        secondaryLabel="Raw captured text"
      />
    </>
  );
}
