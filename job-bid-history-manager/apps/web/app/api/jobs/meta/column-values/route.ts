import { NextResponse } from "next/server";

import { withTeamRoute } from "@/lib/api/with-team-route";
import { listJobsFromFilters } from "@/lib/jobs/list-jobs";
import { parseJobFiltersFromSearchParams } from "@/lib/jobs/query-params";
import type { JobFilterableField } from "@jbhm/shared";

const FILTERABLE: JobFilterableField[] = [
  "captured_by",
  "company_name",
  "job_title",
  "location",
  "salary_text",
  "tags",
];

export async function GET(request: Request) {
  return withTeamRoute(request, async (teamId) => {
    const url = new URL(request.url);
    const field = url.searchParams.get("field") as JobFilterableField;
    if (!FILTERABLE.includes(field)) {
      return NextResponse.json({ error: "Invalid field" }, { status: 400 });
    }

    const filters = parseJobFiltersFromSearchParams(url.searchParams);
    const { items } = await listJobsFromFilters(teamId, {
      ...filters,
      page: 1,
      page_size: 500,
    });

    const counts = new Map<string, number>();
    for (const job of items) {
      if (field === "tags") {
        for (const t of job.tags) {
          counts.set(t.name, (counts.get(t.name) ?? 0) + 1);
        }
      } else {
        const v = String((job as Record<string, unknown>)[field] ?? "").trim() || "—";
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
    }

    const values = [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

    return NextResponse.json({ field, values });
  });
}
