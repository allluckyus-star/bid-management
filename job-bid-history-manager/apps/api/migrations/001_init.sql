-- Job Bid History Manager - initial schema

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    email TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    captured_by TEXT NOT NULL,
    company_name TEXT,
    job_title TEXT,
    location TEXT,
    salary_text TEXT,
    salary_min INTEGER,
    salary_max INTEGER,
    salary_currency TEXT,
    source_url TEXT,
    page_title TEXT,
    captured_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS job_capture_events (
    id TEXT PRIMARY KEY,
    job_id TEXT,
    captured_by TEXT NOT NULL,
    source_url TEXT,
    page_title TEXT,
    captured_text TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    extension_version TEXT,
    capture_method TEXT,
    raw_payload_json TEXT,
    FOREIGN KEY(job_id) REFERENCES jobs(id)
);

CREATE TABLE IF NOT EXISTS job_descriptions (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    raw_text TEXT NOT NULL,
    cleaned_text TEXT,
    extracted_json TEXT,
    extracted_at TEXT,
    model_name TEXT,
    prompt_version TEXT,
    confidence REAL,
    FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS resume_files (
    id TEXT PRIMARY KEY,
    original_filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type TEXT,
    file_size INTEGER,
    sha256_hash TEXT,
    uploaded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS resume_texts (
    id TEXT PRIMARY KEY,
    resume_file_id TEXT NOT NULL,
    extracted_text TEXT NOT NULL,
    extraction_method TEXT,
    extracted_at TEXT NOT NULL,
    FOREIGN KEY(resume_file_id) REFERENCES resume_files(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS job_resumes (
    job_id TEXT NOT NULL,
    resume_file_id TEXT NOT NULL,
    linked_at TEXT NOT NULL,
    PRIMARY KEY(job_id, resume_file_id),
    FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY(resume_file_id) REFERENCES resume_files(id)
);

CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job_tags (
    job_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(job_id, tag_id),
    FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

-- FTS5 search index (contentless external content table pattern)
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    job_id UNINDEXED,
    company_name,
    job_title,
    location,
    salary_text,
    source_url,
    jd_text,
    resume_text,
    resume_filename,
    tag_text,
    notes_text,
    tokenize = 'porter unicode61'
);

CREATE INDEX IF NOT EXISTS idx_jobs_captured_at ON jobs(captured_at);
CREATE INDEX IF NOT EXISTS idx_jobs_captured_by ON jobs(captured_by);
CREATE INDEX IF NOT EXISTS idx_jobs_deleted_at ON jobs(deleted_at);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company_name);
