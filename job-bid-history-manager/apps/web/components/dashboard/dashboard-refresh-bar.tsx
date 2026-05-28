"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { useInvalidateDashboard } from "@/hooks/use-dashboard-queries";
import { FREE_TIER_SAFE_MODE } from "@/lib/config/free-tier";

export function DashboardRefreshBar() {
  const invalidate = useInvalidateDashboard();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);

  const handleRefresh = useCallback(async () => {
    setBusy(true);
    try {
      await Promise.all([invalidate.jobs(), invalidate.summary(), invalidate.timeline()]);
      setLastUpdated(new Date());
    } finally {
      setBusy(false);
    }
  }, [invalidate]);

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
      <span className="text-muted-foreground">
        {FREE_TIER_SAFE_MODE
          ? "Free-tier mode: data refreshes manually (no background polling)."
          : "Dashboard data may auto-refresh when the tab is visible."}
        {lastUpdated ? ` Last updated ${lastUpdated.toLocaleTimeString()}.` : ""}
      </span>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void handleRefresh()}>
        <RefreshCw className={`mr-1.5 h-4 w-4 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Refreshing…" : "Refresh"}
      </Button>
    </div>
  );
}
