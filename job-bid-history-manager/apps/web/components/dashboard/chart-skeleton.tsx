export function ChartSkeleton() {
  return (
    <div className="mb-4 rounded-xl border bg-card/50 p-4">
      <div className="mb-3 flex justify-between">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-7 w-12 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
      <div className="flex h-[280px] items-end gap-1 px-2">
        {Array.from({ length: 24 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 animate-pulse rounded-t bg-muted/80"
            style={{ height: `${30 + ((i * 17) % 55)}%` }}
          />
        ))}
      </div>
    </div>
  );
}
