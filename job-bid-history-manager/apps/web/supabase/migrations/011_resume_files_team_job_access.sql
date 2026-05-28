-- Align resume_files.team_id with jobs and allow team members via job membership.
update public.resume_files rf
set team_id = j.team_id
from public.jobs j
where rf.job_id = j.id
  and (rf.team_id is null or rf.team_id is distinct from j.team_id);

drop policy if exists "resume_files_team_member" on public.resume_files;

create policy "resume_files_team_member"
  on public.resume_files for all to authenticated
  using (
    (team_id is not null and public.is_team_member(team_id))
    or exists (
      select 1
      from public.jobs j
      where j.id = resume_files.job_id
        and j.deleted_at is null
        and public.is_team_member(j.team_id)
    )
  )
  with check (
    (team_id is not null and public.is_team_member(team_id))
    or exists (
      select 1
      from public.jobs j
      where j.id = resume_files.job_id
        and j.deleted_at is null
        and public.is_team_member(j.team_id)
    )
  );
