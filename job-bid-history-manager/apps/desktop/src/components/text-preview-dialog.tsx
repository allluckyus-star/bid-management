import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { sanitizeDisplayText } from "@/lib/sanitize";

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-2 text-sm">
          {primary && (
            <section>
              <h4 className="mb-2 font-medium text-muted-foreground">Content</h4>
              <pre className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 font-sans text-xs leading-relaxed">
                {sanitizeDisplayText(primary)}
              </pre>
            </section>
          )}
          {secondary && (
            <section>
              <h4 className="mb-2 font-medium text-muted-foreground">{secondaryLabel}</h4>
              <pre className="whitespace-pre-wrap rounded-lg border p-3 font-sans text-xs leading-relaxed opacity-80">
                {sanitizeDisplayText(secondary)}
              </pre>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
