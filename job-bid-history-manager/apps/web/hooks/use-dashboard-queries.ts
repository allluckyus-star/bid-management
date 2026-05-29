"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type { JobFilters, TimelineBucketKey, TimelineResponse } from "@jbhm/shared";
import {
  fetchCapturedByUsers,
  fetchDashboard,
  fetchJob,
  fetchJobs,
  fetchTags,
  fetchTimeline,
} from "@/lib/api/client";
import { useTeamId } from "@/context/team-context";
import { dashboardKeys } from "@/lib/dashboard/query-keys";
import { DASHBOARD_FALLBACK_REFETCH_MS } from "@/lib/dashboard/realtime-invalidation";
import { FREE_TIER_SAFE_MODE } from "@/lib/config/free-tier";
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
  const teamId = useTeamId();
  const interval = useVisibleInterval(
    FREE_TIER_SAFE_MODE ? false : opts.pollMs ?? DASHBOARD_FALLBACK_REFETCH_MS,
    opts.paused,
  );
  return useQuery({
    queryKey: dashboardKeys.jobs(teamId, apiFilters),
    queryFn: () => fetchJobs(teamId, apiFilters),
    staleTime: STALE.jobs,
    refetchInterval: interval,
    refetchOnWindowFocus: !FREE_TIER_SAFE_MODE,
  });
}

export function useDashboardSummaryQuery(opts: { paused: boolean }) {
  const teamId = useTeamId();
  const interval = useVisibleInterval(
    FREE_TIER_SAFE_MODE ? false : DASHBOARD_FALLBACK_REFETCH_MS,
    opts.paused,
  );
  return useQuery({
    queryKey: dashboardKeys.summary(teamId),
    queryFn: () => fetchDashboard(teamId),
    staleTime: STALE.summary,
    refetchInterval: interval,
    refetchOnWindowFocus: !FREE_TIER_SAFE_MODE,
    retry: 1,
  });
}

export function useTagsQuery() {
  const teamId = useTeamId();
  return useQuery({
    queryKey: dashboardKeys.tags(teamId),
    queryFn: () => fetchTags(teamId),
    staleTime: STALE.tags,
  });
}

export function useCapturedByUsersQuery() {
  const teamId = useTeamId();
  return useQuery({
    queryKey: dashboardKeys.users(teamId),
    queryFn: () => fetchCapturedByUsers(teamId),
    staleTime: STALE.users,
  });
}

export function useTimelineQuery(
  bucket: TimelineBucketKey,
  range: { start: string; end: string } | null,
  listContext?: JobFilters,
) {
  const teamId = useTeamId();
  return useQuery<TimelineResponse>({
    queryKey: [...dashboardKeys.timeline(teamId, bucket, range?.start, range?.end), listContext] as const,
    queryFn: () => fetchTimeline(teamId, bucket, range!, listContext),
    enabled: !!range,
    staleTime: STALE.timeline,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    retry: 1,
  });
}

export function useJobDetailQuery(jobId: string | null) {
  const teamId = useTeamId();
  return useQuery({
    queryKey: dashboardKeys.job(teamId, jobId ?? ""),
    queryFn: () => fetchJob(teamId, jobId!),
    enabled: !!jobId,
    staleTime: 30_000,
  });
}

export function useInvalidateDashboard() {
  const teamId = useTeamId();
  const qc = useQueryClient();
  return {
    jobs: () => qc.invalidateQueries({ queryKey: ["dashboard", teamId, "jobs"] }),
    summary: () => qc.invalidateQueries({ queryKey: dashboardKeys.summary(teamId) }),
    timeline: () => qc.invalidateQueries({ queryKey: ["dashboard", teamId, "timeline"] }),
    tags: () => qc.invalidateQueries({ queryKey: dashboardKeys.tags(teamId) }),
    all: () => qc.invalidateQueries({ queryKey: dashboardKeys.all(teamId) }),
  };
}
