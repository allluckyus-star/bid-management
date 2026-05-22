import type { JobFilters, TimelineBucketKey } from "@jbhm/shared";

export const dashboardKeys = {
  all: ["dashboard"] as const,
  jobs: (filters: JobFilters) => ["dashboard", "jobs", filters] as const,
  summary: () => ["dashboard", "summary"] as const,
  tags: () => ["dashboard", "tags"] as const,
  users: () => ["dashboard", "users"] as const,
  timeline: (bucket: TimelineBucketKey, start?: string, end?: string) =>
    ["dashboard", "timeline", bucket, start ?? "", end ?? ""] as const,
  job: (id: string) => ["dashboard", "job", id] as const,
};
