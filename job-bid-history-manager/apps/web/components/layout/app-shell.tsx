"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useSidebarCollapsed } from "@/components/layout/use-sidebar-collapsed";
import { TeamMembersDialog } from "@/components/teams/team-members-dialog";
import { Toaster } from "@/components/ui/sonner";
import { useInvalidateDashboard } from "@/hooks/use-dashboard-queries";
import { useTeamRealtime } from "@/hooks/use-team-realtime";
import { pageMetaForPath } from "@/lib/layout/nav-config";
import { notifyActionSuccess } from "@/lib/jbhm/notify";

type Props = {
  teamId: string;
  children: React.ReactNode;
};

export function AppShell({ teamId, children }: Props) {
  useTeamRealtime(teamId);
  const pathname = usePathname();
  const meta = pageMetaForPath(pathname, teamId);
  const { collapsed, toggle, hydrated } = useSidebarCollapsed();
  const [dark, setDark] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const invalidate = useInvalidateDashboard();

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
    <div className="flex h-screen min-h-0 overflow-hidden bg-muted/20">
      <Sidebar
        teamId={teamId}
        collapsed={hydrated ? collapsed : false}
        onToggle={toggle}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          teamId={teamId}
          meta={meta}
          dark={dark}
          onToggleDark={() => setDark((d) => !d)}
          refreshing={refreshing}
          onRefresh={handleManualRefresh}
          onOpenTeam={() => setMembersOpen(true)}
        />

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] p-4 md:p-6">{children}</div>
        </main>
      </div>

      <TeamMembersDialog teamId={teamId} open={membersOpen} onOpenChange={setMembersOpen} />
      <Toaster theme={dark ? "dark" : "light"} position="bottom-right" richColors closeButton />
    </div>
  );
}
