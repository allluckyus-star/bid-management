-- Enable Supabase Realtime for team dashboard tables (idempotent)

do $$
declare
  tbl text;
  tables text[] := array[
    'jobs',
    'job_descriptions',
    'resume_files',
    'tags',
    'job_tags',
    'notes'
  ];
begin
  foreach tbl in array tables
  loop
    begin
      execute format(
        'alter publication supabase_realtime add table public.%I',
        tbl
      );
    exception
      when duplicate_object then
        null;
      when others then
        if sqlerrm like '%already member of publication%' then
          null;
        else
          raise;
        end if;
    end;
  end loop;
end $$;
