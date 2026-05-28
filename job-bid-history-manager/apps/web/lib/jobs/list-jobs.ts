import type { JobFilters, JobListItem, JobListResponse, Tag } from "@jbhm/shared";

import { applyTeamDateFilters } from "@/lib/jobs/date-filters";
import { parseJobFiltersFromSearchParams } from "@/lib/jobs/query-params";
import { createClient } from "@/lib/supabase/server";
import { getTeamTimezone } from "@/lib/teams/team-timezone";

type JobRow = {
  id: string;
  captured_by: string | null;
  company_name: string | null;
  job_title: string | null;
  location: string | null;
  salary_text: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  source_url: string | null;
  page_title: string | null;
  captured_at: string;
  created_at: string;
  updated_at: string;
  job_descriptions: { id: string }[] | null;
  job_tags:
    | { tag_id: string; tags: { id: string; name: string; color: string | null } | null }[]
    | null;
  notes: { body: string }[] | null;
  resume_files:
    | {
        id: string;
        original_filename: string;
        file_size: number | null;
        uploaded_at: string;
      }[]
    | null;
};

function mapRow(row: JobRow): JobListItem {
  const tags: Tag[] = (row.job_tags ?? []).flatMap((jt) => {
    const t = jt.tags;
    if (!t) return [];
    const list = Array.isArray(t) ? t : [t];
    return list.map((tag) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      created_at: "",
    }));
  });

  const noteBody = row.notes?.[0]?.body ?? null;
  const notePreview = noteBody
    ? noteBody.length > 80
      ? `${noteBody.slice(0, 80)}…`
      : noteBody
    : null;
  const resume = row.resume_files?.[0];

  return {
    id: row.id,
    captured_by: row.captured_by ?? "",
    company_name: row.company_name,
    job_title: row.job_title,
    location: row.location,
    salary_text: row.salary_text,
    salary_min: row.salary_min,
    salary_max: row.salary_max,
    salary_currency: row.salary_currency,
    source_url: row.source_url,
    page_title: row.page_title,
    captured_at: row.captured_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    tags,
    resume: resume
      ? {
          id: resume.id,
          original_filename: resume.original_filename,
          file_size: resume.file_size,
          linked_at: resume.uploaded_at,
        }
      : null,
    notes_preview: notePreview,
    notes: null,
    has_jd: (row.job_descriptions?.length ?? 0) > 0,
  };
}

function escapeIlike(s: string): string {
  return s.replace(/[%_\\]/g, "\\$&");
}

export async function listJobsFromFilters(
  teamId: string,
  filters: JobFilters & { page?: number; page_size?: number },
): Promise<JobListResponse> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filters.page_size ?? 50));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = await createClient();
  const timeZone = await getTeamTimezone(supabase, teamId);
  const resolvedFilters = applyTeamDateFilters(filters, timeZone);

  let jobIdFilter: string[] | null = null;

  if (filters.tags?.length) {
    const tagNames = filters.tags.map((t) => t.toLowerCase());
    const { data: tagRows } = await supabase
      .from("tags")
      .select("id, name")
      .eq("team_id", teamId);
    const tagIds = (tagRows ?? [])
      .filter((t) => tagNames.includes(t.name.toLowerCase()))
      .map((t) => t.id);
    if (!tagIds.length) {
      return { items: [], total: 0, page, page_size: pageSize };
    }
    const { data: jt } = await supabase.from("job_tags").select("job_id").in("tag_id", tagIds);
    jobIdFilter = [...new Set((jt ?? []).map((r) => r.job_id))];
    if (!jobIdFilter.length) {
      return { items: [], total: 0, page, page_size: pageSize };
    }
  }

  let query = supabase
    .from("jobs")
    .select(
      `
      id,
      captured_by,
      company_name,
      job_title,
      location,
      salary_text,
      salary_min,
      salary_max,
      salary_currency,
      source_url,
      page_title,
      captured_at,
      created_at,
      updated_at,
      job_descriptions ( id ),
      job_tags ( tag_id, tags ( id, name, color ) ),
      notes ( body ),
      resume_files ( id, original_filename, file_size, uploaded_at )
    `,
      { count: "exact" },
    )
    .is("deleted_at", null)
    .eq("team_id", teamId);

  if (jobIdFilter) query = query.in("id", jobIdFilter);
  if (resolvedFilters.captured_by) query = query.eq("captured_by", resolvedFilters.captured_by);
  if (resolvedFilters.date_from) query = query.gte("captured_at", resolvedFilters.date_from);
  if (resolvedFilters.date_to) query = query.lte("captured_at", resolvedFilters.date_to);

  if (resolvedFilters.q?.trim()) {
    const q = escapeIlike(resolvedFilters.q.trim());
    query = query.or(
      `company_name.ilike.%${q}%,job_title.ilike.%${q}%,location.ilike.%${q}%,salary_text.ilike.%${q}%,captured_by.ilike.%${q}%`,
    );
  }

  const colIn = filters.column_in ?? {};
  for (const [field, vals] of Object.entries(colIn)) {
    if (vals?.length && ["company_name", "job_title", "location", "salary_text", "captured_by"].includes(field)) {
      query = query.in(field, vals);
    }
  }

  const colSearch = filters.column_search ?? {};
  for (const [field, val] of Object.entries(colSearch)) {
    if (!val?.trim()) continue;
    const v = escapeIlike(val.trim());
    if (field === "captured_by") query = query.ilike("captured_by", `%${v}%`);
    if (field === "company_name") query = query.ilike("company_name", `%${v}%`);
    if (field === "job_title") query = query.ilike("job_title", `%${v}%`);
    if (field === "location") query = query.ilike("location", `%${v}%`);
    if (field === "salary_text") query = query.ilike("salary_text", `%${v}%`);
    if (field === "source_url") query = query.ilike("source_url", `%${v}%`);
    if (field === "jd") query = query.not("job_descriptions", "is", null);
    if (field === "resume") query = query.not("resume_files", "is", null);
  }

  const sort = filters.sort?.[0] ?? { field: "captured_at", dir: "desc" as const };
  const sortField = [
    "captured_at",
    "captured_by",
    "company_name",
    "job_title",
    "location",
    "salary_text",
  ].includes(sort.field)
    ? sort.field
    : "captured_at";

  query = query
    .order(sortField, { ascending: sort.dir === "asc" })
    .range(from, to);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    items: ((data ?? []) as unknown as JobRow[]).map(mapRow),
    total: count ?? 0,
    page,
    page_size: pageSize,
  };
}

export async function listJobs(options: {
  page?: number;
  pageSize?: number;
}): Promise<JobListResponse> {
  throw new Error("listJobs requires teamId — use listJobsFromFilters(teamId, …)");
}

export async function listJobsFromRequest(
  request: Request,
  teamId: string,
): Promise<JobListResponse> {
  const url = new URL(request.url);
  return listJobsFromFilters(teamId, parseJobFiltersFromSearchParams(url.searchParams));
}

export async function getJobById(jobId: string): Promise<JobListItem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select(
      `
      id,
      captured_by,
      company_name,
      job_title,
      location,
      salary_text,
      salary_min,
      salary_max,
      salary_currency,
      source_url,
      page_title,
      captured_at,
      created_at,
      updated_at,
      job_descriptions ( id ),
      job_tags ( tag_id, tags ( id, name, color ) ),
      notes ( body ),
      resume_files ( id, original_filename, file_size, uploaded_at )
    `,
    )
    .eq("id", jobId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  const item = mapRow(data as unknown as JobRow);
  const noteBody = (data as unknown as JobRow).notes?.[0]?.body ?? null;
  return { ...item, notes: noteBody };
}
