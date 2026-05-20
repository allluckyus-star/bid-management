from typing import Any

from pydantic import BaseModel, Field


class CaptureJobRequest(BaseModel):
    source_url: str = ""
    page_title: str = ""
    captured_text: str = Field(min_length=1)
    captured_at: str
    captured_by: str = Field(min_length=1)
    extension_version: str | None = None
    capture_method: str | None = "document.body.innerText"
    raw_payload_json: str | None = None


class JobExtractionResult(BaseModel):
    company_name: str = ""
    job_title: str = ""
    location: str = ""
    salary_text: str = ""
    salary_min: int | None = None
    salary_max: int | None = None
    salary_currency: str = "USD"
    employment_type: str = ""
    seniority: str = ""
    required_skills: list[str] = Field(default_factory=list)
    nice_to_have_skills: list[str] = Field(default_factory=list)
    cleaned_job_description: str = ""
    hiring_contact: str | None = None
    confidence: float = 0.0


class TagOut(BaseModel):
    id: str
    name: str
    color: str | None = None
    created_at: str


class ResumeSummaryOut(BaseModel):
    id: str
    original_filename: str
    file_size: int | None = None
    linked_at: str


class JobListItemOut(BaseModel):
    id: str
    captured_by: str
    company_name: str | None = None
    job_title: str | None = None
    location: str | None = None
    salary_text: str | None = None
    salary_min: int | None = None
    salary_max: int | None = None
    salary_currency: str | None = None
    source_url: str | None = None
    page_title: str | None = None
    captured_at: str
    created_at: str
    updated_at: str
    tags: list[TagOut] = Field(default_factory=list)
    resume: ResumeSummaryOut | None = None
    notes_preview: str | None = None
    notes: str | None = None
    has_jd: bool = False


class JobListResponse(BaseModel):
    items: list[JobListItemOut]
    total: int
    page: int
    page_size: int


class DashboardSummaryOut(BaseModel):
    total_bids: int
    today_bids: int
    week_bids: int
    top_bidder: str | None = None
    total_companies: int


class JobPatchRequest(BaseModel):
    captured_by: str | None = None
    company_name: str | None = None
    job_title: str | None = None
    location: str | None = None
    salary_text: str | None = None
    source_url: str | None = None
    notes: str | None = None


class TagCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    color: str | None = None


class TagPatchRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    color: str | None = None


class BulkDeleteResponse(BaseModel):
    deleted_count: int


class CapturedByListResponse(BaseModel):
    users: list[str]


class ColumnValueOptionOut(BaseModel):
    value: str
    count: int


class ColumnValuesResponse(BaseModel):
    field: str
    values: list[ColumnValueOptionOut]


class BulkDeleteRequest(BaseModel):
    job_ids: list[str] = Field(min_length=1)


class JDOut(BaseModel):
    raw_text: str
    cleaned_text: str | None = None
    extracted_json: dict[str, Any] | None = None
    extracted_at: str | None = None
    model_name: str | None = None


class CaptureJobResponse(BaseModel):
    job_id: str
    message: str
    extraction_mode: str


class ResumePreviewOut(BaseModel):
    resume_file_id: str
    extracted_text: str


class ReextractJDResponse(BaseModel):
    jd: JDOut
    job_fields: JobExtractionResult


class TimelineCompanyOut(BaseModel):
    company: str
    count: int


class TimelineBucketOut(BaseModel):
    bucket_start: str
    bucket_end: str
    count: int
    table_count: int = 0
    top_companies: list[TimelineCompanyOut] = Field(default_factory=list)


class TimelineSeriesOut(BaseModel):
    captured_by: str
    buckets: list[TimelineBucketOut]


class TimelineResponse(BaseModel):
    bucket: str
    start: str
    end: str
    history_start: str | None = None
    history_end: str | None = None
    series: list[TimelineSeriesOut]
