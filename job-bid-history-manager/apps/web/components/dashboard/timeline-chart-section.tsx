"use client";

import type { TimelineBucketKey } from "@jbhm/shared";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { ChartSkeleton } from "@/components/dashboard/chart-skeleton";
import { useDashboardFilters } from "@/components/dashboard/dashboard-filters-context";
import { useTimelineQuery } from "@/hooks/use-dashboard-queries";

const TimelineChart = dynamic(
  () =>
    import("@/components/jbhm/timeline-chart").then((m) => ({
      default: m.TimelineChart,
    })),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

type Props = {
  dark: boolean;
};

export function TimelineChartSection({ dark }: Props) {
  const { listContext } = useDashboardFilters();
  const [bucket, setBucket] = useState<TimelineBucketKey>("1d");
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);

  const timeline = useTimelineQuery(bucket, range, listContext);

  const handleRequestRange = useCallback(
    (b: TimelineBucketKey, r: { start: string; end: string }) => {
      setBucket(b);
      setRange(r);
    },
    [],
  );

  return (
    <TimelineChart
      dark={dark}
      data={timeline.data ?? null}
      loading={timeline.isLoading}
      error={
        timeline.isError
          ? timeline.error instanceof Error
            ? timeline.error.message
            : "Chart failed to load"
          : null
      }
      onRetry={() => void timeline.refetch()}
      onRequestRange={handleRequestRange}
    />
  );
}
