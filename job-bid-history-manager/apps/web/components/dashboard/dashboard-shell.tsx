"use client";

import { Moon, Puzzle, RefreshCw, Sun, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardCardsSection } from "@/components/dashboard/dashboard-cards-section";
import { DashboardFiltersProvider } from "@/components/dashboard/dashboard-filters-context";
import { FiltersSection } from "@/components/dashboard/filters-section";
import { JobsTableSection } from "@/components/dashboard/jobs-table-section";
import { TimelineChartSection } from "@/components/dashboard/timeline-chart-section";
import { TeamMembersDialog } from "@/components/teams/team-members-dialog";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { useInteractionHold } from "@/hooks/use-interaction-hold";
import { useInvalidateDashboard } from "@/hooks/use-dashboard-queries";
import { notifyActionSuccess } from "@/lib/jbhm/notify";

function DashboardShellInner({ teamId }: { teamId: string }) {
  const [dark, setDark] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const {
    held: interactionHeld,
    setHold: setInteractionHold,
    isHeld: isInteractionHeld,
  } = useInteractionHold();
  const invalidate = useInvalidateDashboard();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const handleManualRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await invalidate.all();
      notifyActionSuccess("Refreshed", "Dashboard data updated");
    } finally {
      setRefreshing(false);
    }
  }, [invalidate]);

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Job Bid History Manager</h1>
            <p className="text-sm text-muted-foreground">Team bid history</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/teams">Teams</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setMembersOpen(true)}>
              <Users className="mr-1 h-4 w-4" />
              Team
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/team/${teamId}/dashboard/extension`}>
                <Puzzle className="mr-1 h-4 w-4" />
                Extension
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleManualRefresh()}
              disabled={refreshing}
            >
              <RefreshCw className={`mr-1 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setDark((d) => !d)}>
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-6 px-6 py-6">
        <DashboardCardsSection paused={isInteractionHeld()} />

        <section className="rounded-xl border bg-card p-4 shadow-sm">
          <FiltersSection interactionHeld={interactionHeld} />
          <TimelineChartSection dark={dark} />
          <JobsTableSection
            interactionHeld={interactionHeld}
            setInteractionHold={setInteractionHold}
          />
        </section>
      </main>
      <TeamMembersDialog teamId={teamId} open={membersOpen} onOpenChange={setMembersOpen} />
      <Toaster theme={dark ? "dark" : "light"} position="bottom-right" richColors closeButton />
    </div>
  );
}

export function DashboardShell({ teamId }: { teamId: string }) {
  return (
    <DashboardFiltersProvider>
      <DashboardShellInner teamId={teamId} />
    </DashboardFiltersProvider>
  );
}
