"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CopyTextButton } from "@/components/jbhm/copy-text-button";
import { sanitizeDisplayText } from "@/lib/jbhm/sanitize";

/** Reserve space for copy + close icon buttons (top-right). */
const DIALOG_HEADER_ACTIONS_PADDING = "pr-[4.75rem]";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  primary?: string | null;
  secondary?: string | null;
  secondaryLabel?: string;
};

export function TextPreviewDialog({
  open,
  onOpenChange,
  title,
  primary,
  secondary,
  secondaryLabel = "Raw capture",
}: Props) {
  const body = (primary ?? "").trim();
  const secondaryBody = (secondary ?? "").trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby="text-preview-desc"
        className="max-h-[85vh] max-w-2xl overflow-hidden"
        topActions={<CopyTextButton text={body} title="Copy text" />}
      >
        <DialogHeader className={DIALOG_HEADER_ACTIONS_PADDING}>
          <DialogTitle className="leading-snug">{title}</DialogTitle>
        </DialogHeader>
        <p id="text-preview-desc" className="sr-only">
          Preview with copy button
        </p>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-2 text-sm">
          {body ? (
            <pre className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 font-sans text-xs leading-relaxed">
              {sanitizeDisplayText(body)}
            </pre>
          ) : !secondaryBody ? (
            <p className="text-sm text-muted-foreground">No content yet.</p>
          ) : null}
          {secondaryBody ? (
            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="font-medium text-muted-foreground">{secondaryLabel}</h4>
                <CopyTextButton text={secondaryBody} title={`Copy ${secondaryLabel.toLowerCase()}`} />
              </div>
              <pre className="whitespace-pre-wrap rounded-lg border p-3 font-sans text-xs leading-relaxed opacity-80">
                {sanitizeDisplayText(secondaryBody)}
              </pre>
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
