import type { QueryClient } from "@tanstack/react-query";

import { dashboardKeys } from "@/lib/dashboard/query-keys";

export type DashboardChangedArea = "jobs" | "tags" | "resume" | "jd" | "notes";

export const DASHBOARD_FALLBACK_REFETCH_MS = 5 * 60 * 1000;
export const DASHBOARD_REALTIME_DEBOUNCE_MS = 500;

const DEBOUNCE_MS = DASHBOARD_REALTIME_DEBOUNCE_MS;
const pendingAreas = new Map<string, Set<DashboardChangedArea>>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function invalidateJobsBundle(qc: QueryClient, teamId: string) {
  void qc.invalidateQueries({ queryKey: ["dashboard", teamId, "jobs"] });
  void qc.invalidateQueries({ queryKey: dashboardKeys.summary(teamId) });
  void qc.invalidateQueries({ queryKey: ["dashboard", teamId, "timeline"] });
  void qc.invalidateQueries({ queryKey: dashboardKeys.users(teamId) });
}

function flushInvalidation(qc: QueryClient, teamId: string, areas: Set<DashboardChangedArea>) {
  const needsJobs =
    areas.has("jobs") ||
    areas.has("tags") ||
    areas.has("resume") ||
    areas.has("jd") ||
    areas.has("notes");

  if (needsJobs) {
    invalidateJobsBundle(qc, teamId);
  }

  if (areas.has("tags")) {
    void qc.invalidateQueries({ queryKey: dashboardKeys.tags(teamId) });
  }

  if (areas.has("resume") || areas.has("jd") || areas.has("notes")) {
    void qc.invalidateQueries({ queryKey: ["dashboard", teamId, "job"] });
  }
}

/**
 * Debounced React Query invalidation for team dashboard (avoids refetch storms).
 */
export function scheduleDashboardInvalidation(
  qc: QueryClient,
  teamId: string,
  area: DashboardChangedArea,
  debounceMs = DEBOUNCE_MS,
) {
  const key = teamId;
  const set = pendingAreas.get(key) ?? new Set<DashboardChangedArea>();
  set.add(area);
  pendingAreas.set(key, set);

  const existing = timers.get(key);
  if (existing) clearTimeout(existing);

  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      const areas = pendingAreas.get(key);
      pendingAreas.delete(key);
      if (!areas?.size) return;
      flushInvalidation(qc, teamId, areas);
    }, debounceMs),
  );
}

export function clearDashboardInvalidationTimers(teamId: string) {
  const t = timers.get(teamId);
  if (t) clearTimeout(t);
  timers.delete(teamId);
  pendingAreas.delete(teamId);
}
