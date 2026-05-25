-- Team-based multi-tenant isolation (replaces global shared-board RLS)

-- ---------------------------------------------------------------------------
-- Teams (tables first — helper functions reference team_members)
-- ---------------------------------------------------------------------------
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references auth.users (id),
  owner_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create index if not exists team_members_user_id_idx on public.team_members (user_id);

create table if not exists public.team_join_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  requester_user_id uuid not null references auth.users (id),
  requester_email text not null,
  owner_user_id uuid not null references auth.users (id),
  owner_email text not null,
  status text not null check (status in ('pending', 'approved', 'rejected', 'expired')),
  approve_token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  rejected_at timestamptz
);

create index if not exists team_join_requests_team_status_idx
  on public.team_join_requests (team_id, status);

-- ---------------------------------------------------------------------------
-- Helper functions (after team_members exists)
-- ---------------------------------------------------------------------------
create or replace function public.is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members tm
    where tm.team_id = p_team_id and tm.user_id = auth.uid()
  );
$$;

create or replace function public.is_team_owner(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members tm
    where tm.team_id = p_team_id
      and tm.user_id = auth.uid()
      and tm.role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS on team tables
-- ---------------------------------------------------------------------------
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_join_requests enable row level security;

create policy "teams_select_authenticated"
  on public.teams for select to authenticated
  using (true);

create policy "teams_insert_owner"
  on public.teams for insert to authenticated
  with check (owner_user_id = auth.uid());

create policy "teams_update_owner"
  on public.teams for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "team_members_select_member"
  on public.team_members for select to authenticated
  using (public.is_team_member(team_id));

create policy "team_members_delete_owner"
  on public.team_members for delete to authenticated
  using (public.is_team_owner(team_id));

create policy "team_members_insert_owner_bootstrap"
  on public.team_members for insert to authenticated
  with check (
    user_id = auth.uid()
    and role = 'owner'
    and exists (
      select 1 from public.teams t
      where t.id = team_id and t.owner_user_id = auth.uid()
    )
  );

create policy "team_join_requests_select_owner_or_requester"
  on public.team_join_requests for select to authenticated
  using (
    requester_user_id = auth.uid()
    or owner_user_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- Nullable team_id columns (backfill before NOT NULL)
-- ---------------------------------------------------------------------------
alter table public.jobs add column if not exists team_id uuid references public.teams (id);
alter table public.job_descriptions add column if not exists team_id uuid references public.teams (id);
alter table public.tags add column if not exists team_id uuid references public.teams (id);
alter table public.notes add column if not exists team_id uuid references public.teams (id);
alter table public.resume_files add column if not exists team_id uuid references public.teams (id);
alter table public.extension_tokens add column if not exists team_id uuid references public.teams (id);

-- ---------------------------------------------------------------------------
-- Backfill: default team for existing data
-- ---------------------------------------------------------------------------
do $$
declare
  v_team_id uuid;
  v_owner_id uuid;
  v_owner_email text;
begin
  if exists (select 1 from public.teams limit 1) then
    return;
  end if;

  select j.user_id into v_owner_id
  from public.jobs j
  order by j.created_at asc nulls last
  limit 1;

  if v_owner_id is null then
    select p.id into v_owner_id from public.profiles p limit 1;
  end if;

  if v_owner_id is null then
    return;
  end if;

  select coalesce(p.email, u.email) into v_owner_email
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = v_owner_id;

  insert into public.teams (name, owner_user_id, owner_email)
  values ('Default Team', v_owner_id, v_owner_email)
  returning id into v_team_id;

  insert into public.team_members (team_id, user_id, role)
  values (v_team_id, v_owner_id, 'owner')
  on conflict (team_id, user_id) do nothing;

  insert into public.team_members (team_id, user_id, role)
  select distinct v_team_id, j.user_id, 'member'
  from public.jobs j
  where j.user_id is not null
  on conflict (team_id, user_id) do nothing;

  update public.jobs set team_id = v_team_id where team_id is null;
  update public.job_descriptions jd
  set team_id = j.team_id
  from public.jobs j
  where jd.job_id = j.id and jd.team_id is null;

  update public.tags set team_id = v_team_id where team_id is null;
  update public.notes n
  set team_id = j.team_id
  from public.jobs j
  where n.job_id = j.id and n.team_id is null;

  update public.resume_files rf
  set team_id = j.team_id
  from public.jobs j
  where rf.job_id = j.id and rf.team_id is null;

  update public.extension_tokens set team_id = v_team_id where team_id is null;
end $$;

-- ---------------------------------------------------------------------------
-- NOT NULL + indexes
-- ---------------------------------------------------------------------------
alter table public.jobs alter column team_id set not null;
alter table public.job_descriptions alter column team_id set not null;
alter table public.tags alter column team_id set not null;
alter table public.notes alter column team_id set not null;

create index if not exists jobs_team_id_captured_at_idx
  on public.jobs (team_id, captured_at desc)
  where deleted_at is null;

create index if not exists tags_team_id_name_idx on public.tags (team_id, name);

alter table public.tags drop constraint if exists tags_name_key;
alter table public.tags add constraint tags_team_id_name_key unique (team_id, name);

-- extension_tokens.team_id nullable until user creates team-scoped token

-- ---------------------------------------------------------------------------
-- Drop global shared-board policies
-- ---------------------------------------------------------------------------
drop policy if exists "jobs_team_select" on public.jobs;
drop policy if exists "jobs_team_insert" on public.jobs;
drop policy if exists "jobs_team_update" on public.jobs;
drop policy if exists "jobs_team_delete" on public.jobs;
drop policy if exists "job_descriptions_team_all" on public.job_descriptions;
drop policy if exists "tags_team_all" on public.tags;
drop policy if exists "job_tags_team_all" on public.job_tags;
drop policy if exists "notes_team_all" on public.notes;
drop policy if exists "resume_files_team_all" on public.resume_files;

-- ---------------------------------------------------------------------------
-- Team-scoped RLS
-- ---------------------------------------------------------------------------
create policy "jobs_select_team_member"
  on public.jobs for select to authenticated
  using (deleted_at is null and public.is_team_member(team_id));

create policy "jobs_insert_team_member"
  on public.jobs for insert to authenticated
  with check (public.is_team_member(team_id) and auth.uid() = user_id);

create policy "jobs_update_team_member"
  on public.jobs for update to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

create policy "jobs_delete_team_member"
  on public.jobs for delete to authenticated
  using (public.is_team_member(team_id));

create policy "job_descriptions_team_member"
  on public.job_descriptions for all to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

create policy "tags_team_member"
  on public.tags for all to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

create policy "job_tags_team_member"
  on public.job_tags for all to authenticated
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_id and public.is_team_member(j.team_id)
    )
  )
  with check (
    exists (
      select 1 from public.jobs j
      where j.id = job_id and public.is_team_member(j.team_id)
    )
  );

create policy "notes_team_member"
  on public.notes for all to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

create policy "resume_files_team_member"
  on public.resume_files for all to authenticated
  using (
    team_id is null
    or public.is_team_member(team_id)
  )
  with check (
    team_id is null
    or public.is_team_member(team_id)
  );

drop policy if exists "extension_tokens_select_own" on public.extension_tokens;
drop policy if exists "extension_tokens_insert_own" on public.extension_tokens;
drop policy if exists "extension_tokens_update_own" on public.extension_tokens;
drop policy if exists "extension_tokens_delete_own" on public.extension_tokens;

create policy "extension_tokens_select_own"
  on public.extension_tokens for select to authenticated
  using (
    auth.uid() = user_id
    and (team_id is null or public.is_team_member(team_id))
  );

create policy "extension_tokens_insert_own"
  on public.extension_tokens for insert to authenticated
  with check (
    auth.uid() = user_id
    and team_id is not null
    and public.is_team_member(team_id)
  );

create policy "extension_tokens_update_own"
  on public.extension_tokens for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "extension_tokens_delete_own"
  on public.extension_tokens for delete to authenticated
  using (auth.uid() = user_id);

drop trigger if exists teams_updated_at on public.teams;
create trigger teams_updated_at
  before update on public.teams
  for each row execute function public.set_updated_at();
