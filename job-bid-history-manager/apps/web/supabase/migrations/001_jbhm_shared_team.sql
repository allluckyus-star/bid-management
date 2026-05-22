-- Job Bid History Manager — shared team workspace (Phase 1)
-- Run in Supabase Dashboard → SQL Editor (or supabase db push)

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  email text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_authenticated"
  on public.profiles for select to authenticated
  using (true);

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- Jobs (shared team board — all authenticated users see all rows)
-- ---------------------------------------------------------------------------
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  captured_by text,
  company_name text,
  job_title text,
  location text,
  salary_text text,
  salary_min int,
  salary_max int,
  salary_currency text default 'USD',
  salary_period text,
  source_url text,
  page_title text,
  captured_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists jobs_captured_at_idx on public.jobs (captured_at desc);
create index if not exists jobs_deleted_at_idx on public.jobs (deleted_at)
  where deleted_at is null;

alter table public.jobs enable row level security;

create policy "jobs_team_select"
  on public.jobs for select to authenticated
  using (deleted_at is null);

create policy "jobs_team_insert"
  on public.jobs for insert to authenticated
  with check (auth.uid() = user_id);

create policy "jobs_team_update"
  on public.jobs for update to authenticated
  using (true)
  with check (true);

create policy "jobs_team_delete"
  on public.jobs for delete to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Job descriptions
-- ---------------------------------------------------------------------------
create table if not exists public.job_descriptions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  raw_text text not null,
  cleaned_text text,
  extracted_json jsonb,
  model_name text,
  prompt_version text,
  confidence numeric,
  extracted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists job_descriptions_job_id_idx
  on public.job_descriptions (job_id, extracted_at desc);

alter table public.job_descriptions enable row level security;

create policy "job_descriptions_team_all"
  on public.job_descriptions for all to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------------
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  unique (name)
);

alter table public.tags enable row level security;

create policy "tags_team_all"
  on public.tags for all to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- Job tags
-- ---------------------------------------------------------------------------
create table if not exists public.job_tags (
  job_id uuid not null references public.jobs (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  primary key (job_id, tag_id)
);

alter table public.job_tags enable row level security;

create policy "job_tags_team_all"
  on public.job_tags for all to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists notes_job_id_unique on public.notes (job_id);

alter table public.notes enable row level security;

create policy "notes_team_all"
  on public.notes for all to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- Resume files (Storage bucket created separately in dashboard)
-- ---------------------------------------------------------------------------
create table if not exists public.resume_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  job_id uuid references public.jobs (id) on delete set null,
  original_filename text not null,
  storage_path text not null,
  mime_type text,
  file_size bigint,
  sha256_hash text,
  extracted_text text,
  uploaded_at timestamptz not null default now()
);

alter table public.resume_files enable row level security;

create policy "resume_files_team_all"
  on public.resume_files for all to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- Extension capture tokens (Phase 2 — table ready)
-- ---------------------------------------------------------------------------
create table if not exists public.extension_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  token_hash text not null unique,
  name text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

alter table public.extension_tokens enable row level security;

create policy "extension_tokens_select_own"
  on public.extension_tokens for select to authenticated
  using (auth.uid() = user_id);

create policy "extension_tokens_insert_own"
  on public.extension_tokens for insert to authenticated
  with check (auth.uid() = user_id);

create policy "extension_tokens_update_own"
  on public.extension_tokens for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "extension_tokens_delete_own"
  on public.extension_tokens for delete to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jobs_updated_at on public.jobs;
create trigger jobs_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

drop trigger if exists notes_updated_at on public.notes;
create trigger notes_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();
