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
const EMPTY_BOUNDS = { minMs: null, maxMs: null } as const;

export function TimelineChartSection({ dark }: Props) {
  const { listContext } = useDashboardFilters();
  const [bucket, setBucket] = useState<TimelineBucketKey>(DEFAULT_BUCKET);
  const [range, setRange] = useState(() =>
    initialRange(DEFAULT_BUCKET, EMPTY_BOUNDS),
  );

  const timeline = useTimelineQuery(bucket, range, listContext);

  const handleRequestRange = useCallback(
    (b: TimelineBucketKey, r: { start: string; end: string }) => {
      setBucket(b);
      setRange((prev) =>
        prev.start === r.start && prev.end === r.end ? prev : r,
      );
    },
    [],
  );

  /** Block pan/zoom and bucket switches while any timeline request is in flight. */
  const chartLoading = timeline.isPending || timeline.isFetching;

  return (
    <TimelineChart
      dark={dark}
      bucket={bucket}
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
