import { cn } from "@/lib/utils";

/** Shared page width and vertical rhythm (title lives in the top bar only). */
export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("w-full space-y-6", className)}>{children}</div>;
}
