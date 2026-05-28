"use client";

import { useEffect, useState } from "react";

import { DashboardCardsSection } from "@/components/dashboard/dashboard-cards-section";
import { DashboardRefreshBar } from "@/components/dashboard/dashboard-refresh-bar";
import { FiltersSection } from "@/components/dashboard/filters-section";
import { JobsTableSection } from "@/components/dashboard/jobs-table-section";
import { TimelineChartSection } from "@/components/dashboard/timeline-chart-section";
import { PageContainer } from "@/components/layout/page-container";
import { useInteractionHold } from "@/hooks/use-interaction-hold";

export function DashboardOverview() {
  const {
    held: interactionHeld,
    setHold: setInteractionHold,
    isHeld: isInteractionHeld,
  } = useInteractionHold();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    const obs = new MutationObserver(() => {
      setDark(document.documentElement.classList.contains("dark"));
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  return (
    <PageContainer>
      <DashboardRefreshBar />
      <DashboardCardsSection paused={isInteractionHeld()} />

      <TimelineChartSection dark={dark} />

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="p-4 md:p-6">
          <FiltersSection interactionHeld={interactionHeld} variant="overview" />
          <JobsTableSection
            interactionHeld={interactionHeld}
            setInteractionHold={setInteractionHold}
          />
        </div>
      </section>
    </PageContainer>
  );
}
