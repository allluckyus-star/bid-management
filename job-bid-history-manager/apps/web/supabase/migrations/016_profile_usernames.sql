-- Multiple capture usernames per account (one Gmail can register several).

create table if not exists public.profile_usernames (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  constraint profile_usernames_username_format check (username ~ '^[a-z0-9_-]{3,32}$')
);

create unique index if not exists profile_usernames_username_unique_idx
  on public.profile_usernames (lower(username));

create index if not exists profile_usernames_user_id_idx
  on public.profile_usernames (user_id);

-- Backfill from legacy profiles.username column.
insert into public.profile_usernames (user_id, username)
select p.id, lower(trim(p.username))
from public.profiles p
where p.username is not null
  and trim(p.username) <> ''
on conflict do nothing;

alter table public.profile_usernames enable row level security;

create policy "profile_usernames_select_own"
  on public.profile_usernames for select to authenticated
  using (user_id = auth.uid());

create policy "profile_usernames_insert_own"
  on public.profile_usernames for insert to authenticated
  with check (user_id = auth.uid());

create policy "profile_usernames_delete_own"
  on public.profile_usernames for delete to authenticated
  using (user_id = auth.uid());
