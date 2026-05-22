import type { JobFilters, JobSortEntry } from "@jbhm/shared";

const COL_KEYS: Record<string, string> = {
  captured_at: "col_captured_at",
  captured_by: "col_captured_by",
  company_name: "col_company_name",
  job_title: "col_job_title",
  location: "col_location",
  salary_text: "col_salary_text",
  tags: "col_tags",
  resume: "col_resume",
  jd: "col_jd",
  source_url: "col_source_url",
  notes: "col_notes",
};

const COL_IN_KEYS: Record<string, string> = {
  captured_by: "col_in_captured_by",
  company_name: "col_in_company_name",
  job_title: "col_in_job_title",
  location: "col_in_location",
  salary_text: "col_in_salary_text",
  tags: "col_in_tags",
};

export function parseJobFiltersFromSearchParams(
  search: URLSearchParams,
): JobFilters & { page: number; page_size: number } {
  const filters: JobFilters & { page: number; page_size: number } = {
    page: Math.max(1, Number(search.get("page") ?? "1")),
    page_size: Math.min(200, Math.max(1, Number(search.get("page_size") ?? "50"))),
  };

  const q = search.get("q");
  if (q?.trim()) filters.q = q.trim();

  const tags = search.get("tags");
  if (tags) filters.tags = tags.split(",").map((t) => t.trim()).filter(Boolean);

  const capturedBy = search.get("captured_by");
  if (capturedBy) filters.captured_by = capturedBy;

  const dateFrom = search.get("date_from");
  if (dateFrom) filters.date_from = dateFrom;
  const dateTo = search.get("date_to");
  if (dateTo) filters.date_to = dateTo;

  const sort = search.get("sort");
  if (sort) {
    filters.sort = sort
      .split(",")
      .map((part) => {
        const [field, dir] = part.split(":");
        if (!field) return null;
        return { field, dir: dir === "asc" ? "asc" : "desc" } as JobSortEntry;
      })
      .filter(Boolean) as JobSortEntry[];
  }

  const column_search: Record<string, string> = {};
  for (const [field, param] of Object.entries(COL_KEYS)) {
    const v = search.get(param);
    if (v?.trim()) column_search[field] = v.trim();
  }
  if (Object.keys(column_search).length) filters.column_search = column_search;

  const column_in: Record<string, string[]> = {};
  for (const [field, param] of Object.entries(COL_IN_KEYS)) {
    const v = search.get(param);
    if (v) {
      const vals = v.split("|").map((s) => s.trim()).filter(Boolean);
      if (vals.length) column_in[field] = vals;
    }
  }
  if (Object.keys(column_in).length) filters.column_in = column_in;

  return filters;
}
