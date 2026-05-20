export type JobExtraction = {
  company_name: string;
  job_title: string;
  location: string;
  salary_text: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  employment_type: string;
  seniority: string;
  required_skills: string[];
  nice_to_have_skills: string[];
  cleaned_job_description: string;
  hiring_contact: string | null;
  confidence: number;
};

export type Tag = {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
};

export type ResumeSummary = {
  id: string;
  original_filename: string;
  file_size: number | null;
  linked_at: string;
};

export type JobListItem = {
  id: string;
  captured_by: string;
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
  tags: Tag[];
  resume: ResumeSummary | null;
  notes_preview: string | null;
  notes: string | null;
  has_jd: boolean;
};

export type JobListResponse = {
  items: JobListItem[];
  total: number;
  page: number;
  page_size: number;
};

export type DashboardSummary = {
  total_bids: number;
  today_bids: number;
  week_bids: number;
  top_bidder: string | null;
  total_companies: number;
};

export type CaptureJobPayload = {
  source_url: string;
  page_title: string;
  captured_text: string;
  captured_at: string;
  captured_by: string;
  extension_version?: string;
  capture_method?: string;
  raw_payload_json?: string;
};

export const API_DEFAULT_BASE_URL = "http://127.0.0.1:5123";

export const JOB_SORT_FIELDS = [
  "captured_at",
  "captured_by",
  "company_name",
  "job_title",
  "location",
  "salary_text",
  "tags",
  "resume",
  "jd",
  "source_url",
  "notes",
] as const;

export type JobSortField = (typeof JOB_SORT_FIELDS)[number];

/** Columns that show the order (multi-sort) button */
export const JOB_ORDERABLE_FIELDS = [
  "captured_at",
  "captured_by",
  "company_name",
  "job_title",
  "location",
  "salary_text",
  "tags",
  "source_url",
  "notes",
] as const;

export type JobOrderableField = (typeof JOB_ORDERABLE_FIELDS)[number];

/** Columns that support checkbox value filter popups */
export const JOB_FILTERABLE_FIELDS = [
  "captured_by",
  "company_name",
  "job_title",
  "location",
  "salary_text",
  "tags",
] as const;

export type JobFilterableField = (typeof JOB_FILTERABLE_FIELDS)[number];

export type JobColumnSearch = Partial<Record<JobSortField, string>>;

export type JobColumnSelections = Partial<Record<JobFilterableField, string[]>>;

export type JobSortEntry = { field: JobSortField; dir: "asc" | "desc" };

export type ColumnValueOption = { value: string; count: number };

export type ColumnValuesResponse = { field: string; values: ColumnValueOption[] };

/** @deprecated use JobColumnSearch */
export type JobColumnFilters = JobColumnSearch;

export type JobFilters = {
  q?: string;
  tags?: string[];
  captured_by?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
  /** Multi-column sort, e.g. company_name:asc then captured_at:desc */
  sort?: JobSortEntry[];
  /** Per-column text search (popup) */
  column_search?: JobColumnSearch;
  /** Per-column checkbox value filter (popup) */
  column_in?: JobColumnSelections;
};

export const TABLE_PAGE_SIZES = [10, 50, 100] as const;

export type BulkDeleteResponse = {
  deleted_count: number;
};

export type TagCreate = {
  name: string;
  color?: string | null;
};

export type TagPatch = {
  name?: string;
  color?: string | null;
};

export type JDContent = {
  raw_text: string;
  cleaned_text: string | null;
  extracted_json: Record<string, unknown> | null;
  extracted_at: string | null;
  model_name: string | null;
};

export type TimelineBucket = {
  bucket_start: string;
  bucket_end: string;
  count: number;
  /** Bids in this bucket matching current table filters */
  table_count: number;
  top_companies: { company: string; count: number }[];
};

export type TimelineSeries = {
  captured_by: string;
  buckets: TimelineBucket[];
};

export type TimelineResponse = {
  bucket: string;
  start: string;
  end: string;
  /** Earliest job timestamp (pan limit) */
  history_start?: string | null;
  /** Latest job timestamp (pan limit) */
  history_end?: string | null;
  series: TimelineSeries[];
};

export type TimelineBucketKey = "1h" | "1d" | "1month";
