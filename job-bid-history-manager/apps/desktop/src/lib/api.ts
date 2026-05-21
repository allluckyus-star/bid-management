import type {
  BulkDeleteResponse,
  ColumnValuesResponse,
  DashboardSummary,
  JDContent,
  JobFilterableField,
  JobFilters,
  JobListItem,
  JobListResponse,
  JobExtraction,
  Tag,
  TagCreate,
  TagPatch,
  TimelineBucketKey,
  TimelineResponse,
} from "@jbhm/shared";
import { API_DEFAULT_BASE_URL } from "@jbhm/shared";
import { getApiBaseUrl } from "./settings";

function getBaseUrl(): string {
  return getApiBaseUrl() ?? API_DEFAULT_BASE_URL;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
  if (!(init?.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
  }
  const res = await fetch(`${getBaseUrl()}${path}`, { ...init, headers });
  if (!res.ok) {
    let detail = await res.text();
    try {
      const json = JSON.parse(detail) as { detail?: string };
      detail = json.detail ?? detail;
    } catch {
      /* keep */
    }
    throw new Error(detail || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const COL_QUERY_KEYS: Record<string, string> = {
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

function appendListFilters(search: URLSearchParams, filters?: JobFilters): void {
  if (filters?.q) search.set("q", filters.q);
  if (filters?.tags?.length) search.set("tags", filters.tags.join(","));
  if (filters?.captured_by) search.set("captured_by", filters.captured_by);
  if (filters?.date_from) search.set("date_from", filters.date_from);
  if (filters?.date_to) search.set("date_to", filters.date_to);
  if (filters?.sort?.length) {
    search.set("sort", filters.sort.map((s) => `${s.field}:${s.dir}`).join(","));
  }
  if (filters?.column_search) {
    for (const [key, val] of Object.entries(filters.column_search)) {
      const param = COL_QUERY_KEYS[key];
      if (param && typeof val === "string" && val.trim()) search.set(param, val.trim());
    }
  }
  if (filters?.column_in) {
    for (const [key, vals] of Object.entries(filters.column_in)) {
      const param = COL_IN_KEYS[key];
      if (param && vals?.length) search.set(param, vals.join("|"));
    }
  }
}

function toQuery(filters?: JobFilters): string {
  const search = new URLSearchParams();
  appendListFilters(search, filters);
  if (filters?.page) search.set("page", String(filters.page));
  if (filters?.page_size) search.set("page_size", String(filters.page_size));
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchColumnValues(
  field: JobFilterableField,
  context?: JobFilters,
): Promise<ColumnValuesResponse> {
  const search = new URLSearchParams();
  appendListFilters(search, context);
  const qs = search.toString();
  return request<ColumnValuesResponse>(
    `/jobs/meta/column-values?field=${encodeURIComponent(field)}${qs ? `&${qs}` : ""}`,
  );
}

export async function fetchJobs(filters?: JobFilters): Promise<JobListResponse> {
  return request<JobListResponse>(`/jobs${toQuery(filters)}`);
}

export async function fetchDashboard(): Promise<DashboardSummary> {
  return request<DashboardSummary>("/jobs/dashboard/summary");
}

export async function fetchCapturedByUsers(): Promise<string[]> {
  const res = await request<{ users: string[] }>("/jobs/meta/captured-by");
  return res.users;
}

export async function fetchTags(): Promise<Tag[]> {
  return request<Tag[]>("/tags");
}

export async function createTag(payload: TagCreate): Promise<Tag> {
  return request<Tag>("/tags", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateTag(tagId: string, payload: TagPatch): Promise<Tag> {
  return request<Tag>(`/tags/${tagId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function deleteTag(tagId: string): Promise<void> {
  await request<void>(`/tags/${tagId}`, { method: "DELETE" });
}

export async function addTagToJob(jobId: string, tagId: string): Promise<void> {
  await request<void>(`/jobs/${jobId}/tags/${tagId}`, { method: "POST" });
}

export async function removeTagFromJob(jobId: string, tagId: string): Promise<void> {
  await request<void>(`/jobs/${jobId}/tags/${tagId}`, { method: "DELETE" });
}

export async function bulkDeleteJobs(jobIds: string[]): Promise<BulkDeleteResponse> {
  return request<BulkDeleteResponse>("/jobs/bulk", {
    method: "DELETE",
    body: JSON.stringify({ job_ids: jobIds }),
  });
}

export async function patchJob(
  jobId: string,
  payload: Partial<{
    captured_by: string;
    company_name: string;
    job_title: string;
    location: string;
    salary_text: string;
    source_url: string;
    notes: string;
  }>,
): Promise<JobListItem> {
  return request<JobListItem>(`/jobs/${jobId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function fetchJobJd(jobId: string): Promise<JDContent> {
  return request<JDContent>(`/jobs/${jobId}/jd`);
}

export async function reextractJobJd(jobId: string): Promise<{ jd: JDContent; job_fields: JobExtraction }> {
  return request(`/jobs/${jobId}/jd/reextract`, { method: "POST" });
}

export async function uploadJobResume(jobId: string, file: File): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  await request(`/jobs/${jobId}/resume`, { method: "POST", body: form });
}

export async function unlinkJobResume(jobId: string): Promise<void> {
  await request<void>(`/jobs/${jobId}/resume`, { method: "DELETE" });
}

export async function fetchResumePreview(resumeFileId: string): Promise<string> {
  const res = await request<{ extracted_text: string }>(`/resumes/${resumeFileId}/preview`);
  return res.extracted_text;
}

export function resumeDownloadUrl(resumeFileId: string): string {
  return `${getBaseUrl()}/resumes/${resumeFileId}/download`;
}

export async function fetchTimeline(
  bucket: TimelineBucketKey,
  range?: { start?: string; end?: string },
  tableHighlight?: JobFilters,
): Promise<TimelineResponse> {
  const q = new URLSearchParams();
  q.set("bucket", bucket);
  if (range?.start) q.set("start", range.start);
  if (range?.end) q.set("end", range.end);
  appendListFilters(q, tableHighlight);
  const qs = q.toString();
  return request<TimelineResponse>(`/analytics/timeline?${qs}`);
}

export async function seedSampleData(reset = false): Promise<{ jobs_created: number; message: string }> {
  return request(`/dev/seed-sample?reset=${reset}`, { method: "POST" });
}

export async function seedDemoCapture(capturedBy: string): Promise<void> {
  await request("/capture/job", {
    method: "POST",
    body: JSON.stringify({
      source_url: "https://example.com/jobs/senior-engineer",
      page_title: "Senior Software Engineer — Example Corp",
      captured_text: [
        "Senior Software Engineer",
        "Example Corp",
        "Remote · United States",
        "$140,000 - $180,000 / year",
        "",
        "We are looking for a senior engineer with Azure, FastAPI, and React experience.",
      ].join("\n"),
      captured_at: new Date().toISOString(),
      captured_by: capturedBy,
      extension_version: "0.2.0",
      capture_method: "document.body.innerText",
    }),
  });
}

