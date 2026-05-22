"use client";

import { DashboardCards } from "@/components/jbhm/dashboard-cards";
import { useDashboardSummaryQuery } from "@/hooks/use-dashboard-queries";

type Props = {
  paused: boolean;
};

export function DashboardCardsSection({ paused }: Props) {
  const { data, isLoading, isError } = useDashboardSummaryQuery({ paused });

  return <DashboardCards summary={isError ? null : (data ?? null)} loading={isLoading && !data} />;
}
