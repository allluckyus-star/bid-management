"use client";

import type { TimelineBucketKey } from "@jbhm/shared";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { ChartSkeleton } from "@/components/dashboard/chart-skeleton";
import { useDashboardFilters } from "@/components/dashboard/dashboard-filters-context";
import { useTimelineQuery } from "@/hooks/use-dashboard-queries";
import { initialRange } from "@/lib/jbhm/timeline-window";

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

const DEFAULT_BUCKET: TimelineBucketKey = "1d";

export function TimelineChartSection({ dark }: Props) {
  const { listContext } = useDashboardFilters();
  const [bucket, setBucket] = useState<TimelineBucketKey>(DEFAULT_BUCKET);
  const [range, setRange] = useState<{ start: string; end: string }>(() =>
    initialRange(DEFAULT_BUCKET, { minMs: null, maxMs: null }),
  );

  const timeline = useTimelineQuery(bucket, range, listContext);

  const handleRequestRange = useCallback(
    (b: TimelineBucketKey, r: { start: string; end: string }) => {
      setBucket(b);
      setRange((prev) =>
        prev?.start === r.start && prev?.end === r.end ? prev : r,
      );
    },
    [],
  );

  const chartLoading =
    timeline.isPending || timeline.isLoading || timeline.isFetching;

  return (
    <TimelineChart
      dark={dark}
      data={timeline.data ?? null}
      loading={chartLoading}
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
