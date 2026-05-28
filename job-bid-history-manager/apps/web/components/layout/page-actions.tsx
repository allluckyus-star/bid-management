/** Optional row of page-specific actions (titles are shown in the top bar only). */
export function PageActions({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>;
}
