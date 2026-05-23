-- Fix soft-delete on jobs: allow UPDATE to set deleted_at (team board).
-- Run in Supabase Dashboard → SQL Editor if delete shows RLS errors.
--
-- The dashboard delete API uses the service role (bypasses RLS) after login check.
-- This policy still helps PATCH/edit and any client-side Supabase updates.

drop policy if exists "jobs_team_update" on public.jobs;

create policy "jobs_team_update"
  on public.jobs for update to authenticated
  using (deleted_at is null)
  with check (true);
