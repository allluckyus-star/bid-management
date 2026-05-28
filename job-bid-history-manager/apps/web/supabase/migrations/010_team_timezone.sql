-- Team timezone for unified calendar display and analytics bucketing (IANA name, e.g. America/New_York).

alter table public.teams
  add column if not exists timezone text not null default 'UTC';

comment on column public.teams.timezone is 'IANA timezone for team dashboard dates, filters, and chart buckets';
