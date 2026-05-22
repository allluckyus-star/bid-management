-- Resumes bucket for .docx files (run in Supabase SQL editor after 001)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes',
  'resumes',
  false,
  10485760,
  array['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/octet-stream']
)
on conflict (id) do nothing;

create policy "resumes_select_authenticated"
  on storage.objects for select to authenticated
  using (bucket_id = 'resumes');

create policy "resumes_insert_authenticated"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes');

create policy "resumes_update_authenticated"
  on storage.objects for update to authenticated
  using (bucket_id = 'resumes')
  with check (bucket_id = 'resumes');

create policy "resumes_delete_authenticated"
  on storage.objects for delete to authenticated
  using (bucket_id = 'resumes');
