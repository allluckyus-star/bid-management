-- Realtime: team members must be able to SELECT soft-deleted job rows so UPDATE
-- events (deleted_at set) are delivered to other dashboards. App/API still filter
-- deleted_at IS NULL in queries.

drop policy if exists "jobs_select_team_member" on public.jobs;

create policy "jobs_select_team_member"
  on public.jobs for select to authenticated
  using (public.is_team_member(team_id));
