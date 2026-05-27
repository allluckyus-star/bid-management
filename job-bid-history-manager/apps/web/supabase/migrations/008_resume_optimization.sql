-- Resume library, ChatGPT optimization sessions, and generated exports

create table if not exists public.team_resume_originals (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  original_filename text not null,
  storage_path text not null,
  mime_type text,
  file_size integer,
  extracted_text text,
  is_default boolean not null default false,
  uploaded_at timestamptz not null default now()
);

create index if not exists team_resume_originals_team_idx
  on public.team_resume_originals (team_id, uploaded_at desc);

create unique index if not exists team_resume_originals_one_default
  on public.team_resume_originals (team_id)
  where is_default = true;

alter table public.team_resume_originals enable row level security;

create policy "team_resume_originals_team_member"
  on public.team_resume_originals for all to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

create table if not exists public.resume_optimizations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  library_resume_id uuid references public.team_resume_originals (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  prompt_text text,
  gpt_result_raw text,
  company_name text,
  job_title text,
  user_display_name text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists resume_optimizations_team_job_idx
  on public.resume_optimizations (team_id, job_id, created_at desc);

alter table public.resume_optimizations enable row level security;

create policy "resume_optimizations_team_member"
  on public.resume_optimizations for all to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

create table if not exists public.resume_exports (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  optimization_id uuid references public.resume_optimizations (id) on delete set null,
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null,
  display_filename text not null,
  file_size integer,
  created_at timestamptz not null default now()
);

create index if not exists resume_exports_team_job_idx
  on public.resume_exports (team_id, job_id, created_at desc);

alter table public.resume_exports enable row level security;

create policy "resume_exports_team_member"
  on public.resume_exports for all to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

-- Realtime (idempotent)
do $$
begin
  begin
    alter publication supabase_realtime add table public.resume_exports;
  exception
    when duplicate_object then null;
    when others then
      if sqlerrm like '%already member of publication%' then null;
      else raise;
      end if;
  end;
end $$;
