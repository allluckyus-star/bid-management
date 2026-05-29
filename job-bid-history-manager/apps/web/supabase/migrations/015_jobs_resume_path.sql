-- Store the local resume DOCX path (Downloads/...) produced by the extension after
-- ChatGPT builds the optimized resume. Shown in the dashboard "resume" column.
alter table public.jobs add column if not exists resume_path text;
