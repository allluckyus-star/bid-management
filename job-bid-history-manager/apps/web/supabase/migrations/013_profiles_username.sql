-- Add username identity for extension capture.

alter table public.profiles
  add column if not exists username text;

update public.profiles
set username = lower(trim(username))
where username is not null
  and username <> lower(trim(username));

alter table public.profiles
  drop constraint if exists profiles_username_format_check;

alter table public.profiles
  add constraint profiles_username_format_check
  check (
    username is null
    or username ~ '^[a-z0-9_-]{3,32}$'
  );

drop index if exists profiles_username_unique_idx;

create unique index if not exists profiles_username_unique_idx
  on public.profiles (lower(username))
  where username is not null;
