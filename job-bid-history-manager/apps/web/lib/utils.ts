import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { formatDateInTimeZone } from "@/lib/datetime/zoned";

export function formatDate(iso: string, timeZone?: string): string {
  if (timeZone) return formatDateInTimeZone(iso, timeZone);
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function truncate(text: string | null | undefined, max = 48): string {
  if (!text) return "—";
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

// This check can be removed, it is just for tutorial purposes
export const hasEnvVars =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
