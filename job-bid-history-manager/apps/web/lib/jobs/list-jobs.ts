import type { JobListItem, JobListResponse, Tag } from "@jbhm/shared";

import { createClient } from "@/lib/supabase/server";

type JobRow = {
  id: string;
  user_id: string;
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
  job_descriptions: { id: string; cleaned_text: string | null }[] | null;
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

export async function listJobs(options: {
  page?: number;
  pageSize?: number;
}): Promise<JobListResponse> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 50));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = await createClient();

  const { count, error: countError } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);

  if (countError) {
    throw new Error(countError.message);
  }

  const { data, error } = await supabase
    .from("jobs")
    .select(
      `
      id,
      user_id,
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
      job_descriptions ( id, cleaned_text ),
      job_tags ( tag_id, tags ( id, name, color ) ),
      notes ( body ),
      resume_files ( id, original_filename, file_size, uploaded_at )
    `,
    )
    .is("deleted_at", null)
    .order("captured_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(error.message);
  }

  const items: JobListItem[] = ((data ?? []) as unknown as JobRow[]).map((row) => {
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
      notes_preview: noteBody
        ? noteBody.length > 80
          ? `${noteBody.slice(0, 80)}…`
          : noteBody
        : null,
      notes: noteBody,
      has_jd: (row.job_descriptions?.length ?? 0) > 0,
    };
  });

  return {
    items,
    total: count ?? 0,
    page,
    page_size: pageSize,
  };
}
