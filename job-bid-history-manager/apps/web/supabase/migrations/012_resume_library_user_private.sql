-- Make resume library private per user within each team.

drop policy if exists "team_resume_originals_team_member" on public.team_resume_originals;

create policy "team_resume_originals_user_private"
  on public.team_resume_originals for all to authenticated
  using (
    public.is_team_member(team_id)
    and auth.uid() = user_id
  )
  with check (
    public.is_team_member(team_id)
    and auth.uid() = user_id
  );

drop index if exists team_resume_originals_one_default;

create unique index if not exists team_resume_originals_one_default_per_user
  on public.team_resume_originals (team_id, user_id)
  where is_default = true;
