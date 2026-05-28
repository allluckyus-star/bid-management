"use client";

import { DashboardOverview } from "@/components/dashboard/dashboard-overview";

export function DashboardShell({ teamId: _teamId }: { teamId: string }) {
  return <DashboardOverview />;
}
