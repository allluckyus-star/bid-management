import type { JobFilters, TimelineBucketKey } from "@jbhm/shared";

export const dashboardKeys = {
  all: (teamId: string) => ["dashboard", teamId] as const,
  jobs: (teamId: string, filters: JobFilters) => ["dashboard", teamId, "jobs", filters] as const,
  summary: (teamId: string) => ["dashboard", teamId, "summary"] as const,
  tags: (teamId: string) => ["dashboard", teamId, "tags"] as const,
  users: (teamId: string) => ["dashboard", teamId, "users"] as const,
  timeline: (teamId: string, bucket: TimelineBucketKey, start?: string, end?: string) =>
    ["dashboard", teamId, "timeline", bucket, start ?? "", end ?? ""] as const,
  job: (teamId: string, id: string) => ["dashboard", teamId, "job", id] as const,
};
