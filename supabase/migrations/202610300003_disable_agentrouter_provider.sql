alter table public.import_jobs
drop constraint if exists import_jobs_provider_selection_check;

alter table public.import_jobs
add constraint import_jobs_provider_selection_check
check (provider_selection in ('openai', 'gemini', 'both'));
