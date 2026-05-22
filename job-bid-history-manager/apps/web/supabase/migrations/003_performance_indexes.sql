-- Performance indexes for dashboard list + timeline queries

create index if not exists idx_jobs_active_captured_at
  on public.jobs (captured_at desc)
  where deleted_at is null;

create index if not exists idx_jobs_active_timeline
  on public.jobs (captured_at, captured_by)
  where deleted_at is null;

create index if not exists idx_jobs_active_company_title
  on public.jobs (company_name, job_title)
  where deleted_at is null;
