"use client";

import { useEffect, useState } from "react";

import { FiltersSection } from "@/components/dashboard/filters-section";
import { TimelineChartSection } from "@/components/dashboard/timeline-chart-section";
import { PageContainer } from "@/components/layout/page-container";
import { useInteractionHold } from "@/hooks/use-interaction-hold";

export function AnalyticsPageClient() {
  const { isHeld: isInteractionHeld } = useInteractionHold();
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
      <section className="rounded-xl border bg-card p-4 shadow-sm md:p-6">
        <FiltersSection interactionHeld={isInteractionHeld()} variant="analytics" />
        <TimelineChartSection dark={dark} />
      </section>
    </PageContainer>
  );
}
