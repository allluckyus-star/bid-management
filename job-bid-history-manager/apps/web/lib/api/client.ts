import type {
  BulkDeleteResponse,
  ColumnValuesResponse,
  DashboardSummary,
  JDContent,
  JobFilterableField,
  JobFilters,
  JobListItem,
  JobListResponse,
  Tag,
  TagCreate,
  TagPatch,
  TimelineBucketKey,
  TimelineResponse,
} from "@jbhm/shared";
import { timedRequest } from "@/lib/api/timed-request";

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

function teamQs(teamId: string, search?: URLSearchParams): string {
  const q = search ?? new URLSearchParams();
  q.set("teamId", teamId);
  const s = q.toString();
  return s ? `?${s}` : "";
}

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

function toQuery(teamId: string, filters?: JobFilters): string {
  const search = new URLSearchParams();
  appendListFilters(search, filters);
  if (filters?.page) search.set("page", String(filters.page));
  if (filters?.page_size) search.set("page_size", String(filters.page_size));
  return teamQs(teamId, search);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
  if (!(init?.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
  }
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    let detail = await res.text();
    try {
      const json = JSON.parse(detail) as { error?: string; detail?: string };
      detail = json.error ?? json.detail ?? detail;
    } catch {
      /* keep */
    }
    throw new Error(detail || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function fetchColumnValues(
  teamId: string,
  field: JobFilterableField,
  context?: JobFilters,
): Promise<ColumnValuesResponse> {
  const search = new URLSearchParams();
  search.set("field", field);
  appendListFilters(search, context);
  return request<ColumnValuesResponse>(`/api/jobs/meta/column-values${teamQs(teamId, search)}`);
}

export async function fetchJobs(teamId: string, filters?: JobFilters): Promise<JobListResponse> {
  return timedRequest<JobListResponse>("jobs fetch", `/api/jobs${toQuery(teamId, filters)}`);
}

export async function fetchDashboard(teamId: string): Promise<DashboardSummary> {
  return timedRequest<DashboardSummary>(
    "dashboard fetch",
    `/api/jobs/dashboard/summary${teamQs(teamId)}`,
  );
}

export async function fetchCapturedByUsers(teamId: string): Promise<string[]> {
  const res = await timedRequest<{ users: string[] }>(
    "users fetch",
    `/api/jobs/meta/captured-by${teamQs(teamId)}`,
  );
  return res.users;
}

export async function fetchTags(teamId: string): Promise<Tag[]> {
  return timedRequest<Tag[]>("tags fetch", `/api/tags${teamQs(teamId)}`);
}

export async function fetchJob(teamId: string, jobId: string): Promise<JobListItem> {
  return timedRequest<JobListItem>("job fetch", `/api/jobs/${jobId}${teamQs(teamId)}`);
}

export async function createTag(teamId: string, payload: TagCreate): Promise<Tag> {
  return request<Tag>(`/api/tags${teamQs(teamId)}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateTag(teamId: string, tagId: string, payload: TagPatch): Promise<Tag> {
  return request<Tag>(`/api/tags/${tagId}${teamQs(teamId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteTag(teamId: string, tagId: string): Promise<void> {
  await request<void>(`/api/tags/${tagId}${teamQs(teamId)}`, { method: "DELETE" });
}

export async function addTagToJob(teamId: string, jobId: string, tagId: string): Promise<void> {
  await request<void>(`/api/jobs/${jobId}/tags/${tagId}${teamQs(teamId)}`, { method: "POST" });
}

export async function removeTagFromJob(
  teamId: string,
  jobId: string,
  tagId: string,
): Promise<void> {
  await request<void>(`/api/jobs/${jobId}/tags/${tagId}${teamQs(teamId)}`, {
    method: "DELETE",
  });
}

export async function bulkDeleteJobs(
  teamId: string,
  jobIds: string[],
): Promise<BulkDeleteResponse> {
  return request<BulkDeleteResponse>(`/api/jobs/bulk${teamQs(teamId)}`, {
    method: "DELETE",
    body: JSON.stringify({ job_ids: jobIds }),
  });
}

export async function patchJob(
  teamId: string,
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
  return request<JobListItem>(`/api/jobs/${jobId}${teamQs(teamId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function fetchJobJd(teamId: string, jobId: string): Promise<JDContent> {
  return request<JDContent>(`/api/jobs/${jobId}/jd${teamQs(teamId)}`);
}

export async function uploadJobResume(teamId: string, jobId: string, file: File): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  await request(`/api/jobs/${jobId}/resume${teamQs(teamId)}`, { method: "POST", body: form });
}

export async function unlinkJobResume(teamId: string, jobId: string): Promise<void> {
  await request<void>(`/api/jobs/${jobId}/resume${teamQs(teamId)}`, { method: "DELETE" });
}

export async function fetchResumePreview(resumeFileId: string): Promise<string> {
  const res = await request<{ extracted_text: string }>(`/api/resumes/${resumeFileId}/preview`);
  return res.extracted_text;
}

export function resumeDownloadUrl(resumeFileId: string): string {
  return `/api/resumes/${resumeFileId}/download`;
}

export async function fetchTimeline(
  teamId: string,
  bucket: TimelineBucketKey,
  range?: { start?: string; end?: string },
  tableHighlight?: JobFilters,
): Promise<TimelineResponse> {
  const q = new URLSearchParams();
  q.set("bucket", bucket);
  if (range?.start) q.set("start", range.start);
  if (range?.end) q.set("end", range.end);
  appendListFilters(q, tableHighlight);
  return timedRequest<TimelineResponse>(
    "timeline fetch",
    `/api/analytics/timeline${teamQs(teamId, q)}`,
    undefined,
    25_000,
  );
}

export type TeamsListResponse = {
  my_teams: {
    id: string;
    name: string;
    owner_email: string | null;
    role: string;
    is_owner: boolean;
  }[];
  other_teams: {
    id: string;
    name: string;
    owner_email: string | null;
    join_status: "none" | "pending";
  }[];
};

export async function fetchTeams(): Promise<TeamsListResponse> {
  return request<TeamsListResponse>("/api/teams");
}

export async function createTeam(name: string): Promise<{ team: { id: string; name: string } }> {
  return request("/api/teams", { method: "POST", body: JSON.stringify({ name }) });
}

export async function requestJoinTeam(teamId: string): Promise<{ message: string }> {
  return request(`/api/teams/${teamId}/join-request`, { method: "POST" });
}

export type TeamMembersResponse = {
  team_name: string;
  is_owner: boolean;
  members: {
    id: string;
    user_id: string;
    role: string;
    joined_at: string;
    email: string | null;
    display_name: string | null;
  }[];
  pending_requests: { id: string; requester_email: string; created_at: string }[];
};

export async function fetchTeamMembers(teamId: string): Promise<TeamMembersResponse> {
  return request(`/api/team/${teamId}/members`);
}

export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  await request(`/api/teams/${teamId}/members/${userId}`, { method: "DELETE" });
}

export async function rejectJoinRequest(requestId: string): Promise<void> {
  await request(`/api/team-join-requests/${requestId}/reject`, { method: "POST" });
}

export async function approveJoinRequest(
  requestId: string,
  token: string,
): Promise<{ team_id: string }> {
  return request(`/api/team-join-requests/${requestId}/approve`, {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function renameTeam(teamId: string, name: string): Promise<void> {
  await request(`/api/team/${teamId}/members`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export async function fetchPostLoginPath(): Promise<string> {
  const res = await request<{ path: string }>("/api/teams/redirect-path");
  return res.path;
}
