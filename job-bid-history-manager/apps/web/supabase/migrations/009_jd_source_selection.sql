-- Team JD source selection (manual upload/paste, latest captured, or selected history job)

create table if not exists public.team_jd_manual_inputs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  source_type text not null check (source_type in ('text', 'docx', 'pdf')),
  title text,
  original_filename text,
  mime_type text,
  storage_path text,
  extracted_text text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists team_jd_manual_inputs_team_idx
  on public.team_jd_manual_inputs (team_id, created_at desc);

alter table public.team_jd_manual_inputs enable row level security;

create policy "team_jd_manual_inputs_team_member"
  on public.team_jd_manual_inputs for all to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

create table if not exists public.team_jd_preferences (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  mode text not null default 'latest' check (mode in ('latest', 'history', 'manual')),
  history_job_id uuid references public.jobs (id) on delete set null,
  manual_input_id uuid references public.team_jd_manual_inputs (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists team_jd_preferences_team_user_unique
  on public.team_jd_preferences (team_id, user_id);

alter table public.team_jd_preferences enable row level security;

create policy "team_jd_preferences_team_member"
  on public.team_jd_preferences for all to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));
