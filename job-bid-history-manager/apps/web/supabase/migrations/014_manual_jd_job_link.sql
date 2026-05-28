-- Link manual JD inputs to bid-history jobs (company, title, source URL, resume export).

alter table public.team_jd_manual_inputs
  add column if not exists job_id uuid references public.jobs (id) on delete set null,
  add column if not exists source_url text;

create index if not exists team_jd_manual_inputs_job_idx
  on public.team_jd_manual_inputs (job_id)
  where job_id is not null;
