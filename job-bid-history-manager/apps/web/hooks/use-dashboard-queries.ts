"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { JobFilters, TimelineBucketKey } from "@jbhm/shared";
import {
  fetchCapturedByUsers,
  fetchDashboard,
  fetchJob,
  fetchJobs,
  fetchTags,
  fetchTimeline,
} from "@/lib/api/client";
import { dashboardKeys } from "@/lib/dashboard/query-keys";
import { useVisibleInterval } from "@/hooks/use-visible-interval";

const STALE = {
  jobs: 30_000,
  summary: 60_000,
  tags: 5 * 60_000,
  users: 5 * 60_000,
  timeline: 60_000,
} as const;

export function useJobsQuery(
  apiFilters: JobFilters,
  opts: { paused: boolean; pollMs?: number },
) {
  const interval = useVisibleInterval(opts.pollMs ?? 45_000, opts.paused);
  return useQuery({
    queryKey: dashboardKeys.jobs(apiFilters),
    queryFn: () => fetchJobs(apiFilters),
    staleTime: STALE.jobs,
    refetchInterval: interval,
  });
}

export function useDashboardSummaryQuery(opts: { paused: boolean }) {
  const interval = useVisibleInterval(120_000, opts.paused);
  return useQuery({
    queryKey: dashboardKeys.summary(),
    queryFn: fetchDashboard,
    staleTime: STALE.summary,
    refetchInterval: interval,
  });
}

export function useTagsQuery() {
  return useQuery({
    queryKey: dashboardKeys.tags(),
    queryFn: fetchTags,
    staleTime: STALE.tags,
  });
}

export function useCapturedByUsersQuery() {
  return useQuery({
    queryKey: dashboardKeys.users(),
    queryFn: fetchCapturedByUsers,
    staleTime: STALE.users,
  });
}

export function useTimelineQuery(
  bucket: TimelineBucketKey,
  range: { start: string; end: string } | null,
  listContext?: JobFilters,
) {
  return useQuery({
    queryKey: [...dashboardKeys.timeline(bucket, range?.start, range?.end), listContext] as const,
    queryFn: () => fetchTimeline(bucket, range!, listContext),
    enabled: !!range,
    staleTime: STALE.timeline,
    refetchOnWindowFocus: false,
  });
}

export function useJobDetailQuery(jobId: string | null) {
  return useQuery({
    queryKey: dashboardKeys.job(jobId ?? ""),
    queryFn: () => fetchJob(jobId!),
    enabled: !!jobId,
    staleTime: 30_000,
  });
}

export function useInvalidateDashboard() {
  const qc = useQueryClient();
  return {
    jobs: () => qc.invalidateQueries({ queryKey: ["dashboard", "jobs"] }),
    summary: () => qc.invalidateQueries({ queryKey: dashboardKeys.summary() }),
    timeline: () => qc.invalidateQueries({ queryKey: ["dashboard", "timeline"] }),
    tags: () => qc.invalidateQueries({ queryKey: dashboardKeys.tags() }),
    all: () => qc.invalidateQueries({ queryKey: dashboardKeys.all }),
  };
}
