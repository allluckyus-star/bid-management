import type {
  JobFilterableField,
  JobOrderableField,
  JobSortEntry,
  JobSortField,
} from "@jbhm/shared";

export type ColumnControlConfig = {
  filter: boolean;
  sort: boolean;
  search: boolean;
};

export const COLUMN_CONTROLS: Record<JobSortField, ColumnControlConfig> = {
  captured_at: { filter: false, sort: true, search: true },
  captured_by: { filter: true, sort: true, search: true },
  company_name: { filter: true, sort: true, search: true },
  job_title: { filter: true, sort: true, search: true },
  location: { filter: true, sort: true, search: true },
  salary_text: { filter: true, sort: true, search: true },
  tags: { filter: true, sort: true, search: true },
  resume: { filter: false, sort: false, search: true },
  jd: { filter: false, sort: false, search: true },
  source_url: { filter: false, sort: true, search: true },
  notes: { filter: false, sort: true, search: true },
};

export const COLUMN_LABELS: Record<JobSortField, string> = {
  captured_at: "Date",
  captured_by: "User",
  company_name: "Company",
  job_title: "Job Title",
  location: "Location",
  salary_text: "Salary",
  tags: "Tags",
  resume: "Resume",
  jd: "JD",
  source_url: "Source URL",
  notes: "Notes",
};

export function isFilterableField(field: JobSortField): field is JobFilterableField {
  return COLUMN_CONTROLS[field].filter;
}

export function isOrderableField(field: JobSortField): field is JobOrderableField {
  return COLUMN_CONTROLS[field].sort;
}

/** Cycle one column: none → asc → desc → none (single-column sort). */
export function cycleColumnSort(
  sort: JobSortEntry[],
  field: JobOrderableField,
): JobSortEntry[] {
  const entry = sort.find((s) => s.field === field);
  if (!entry) return [{ field, dir: "asc" }];
  if (entry.dir === "asc") return [{ field, dir: "desc" }];
  return [];
}
