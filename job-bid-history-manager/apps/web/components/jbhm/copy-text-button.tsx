"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { dialogIconButtonClass } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { notifyActionSuccess, notifyLoadError } from "@/lib/jbhm/notify";

type Props = {
  text: string;
  className?: string;
  title?: string;
};

export function CopyTextButton({ text, className, title = "Copy to clipboard" }: Props) {
  const [copied, setCopied] = useState(false);
  const value = String(text ?? "").trim();
  const disabled = !value;

  const copy = async () => {
    if (disabled) {
      notifyLoadError("Nothing to copy");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      notifyActionSuccess("Copied to clipboard");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      notifyLoadError("Copy failed");
    }
  };

  return (
    <button
      type="button"
      className={cn(dialogIconButtonClass, className)}
      title={title}
      aria-label={title}
      onClick={() => void copy()}
      disabled={disabled}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}
