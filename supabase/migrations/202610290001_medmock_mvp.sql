create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'student' check (role in ('admin', 'student')),
  display_name text not null default 'Aspirant',
  hide_display_name boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), 'Aspirant')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create table public.papers (
  id text primary key,
  owner_id uuid not null references public.profiles(id),
  title jsonb not null,
  created_at timestamptz not null default now()
);

create table public.paper_versions (
  id text primary key,
  paper_id text not null references public.papers(id) on delete restrict,
  revision integer not null check (revision > 0),
  status text not null check (status in ('draft', 'review', 'published', 'archived')),
  content jsonb not null,
  published_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (paper_id, revision),
  check ((status = 'published') = (published_at is not null))
);

create or replace function public.protect_published_paper_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'published' then
    raise exception 'Published paper revisions are immutable.' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger paper_versions_immutable_after_publish
before update or delete on public.paper_versions
for each row execute function public.protect_published_paper_version();

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  provider_selection text not null check (provider_selection in ('openai', 'gemini', 'both')),
  status text not null check (
    status in ('uploaded', 'extracting', 'review_required', 'ready_to_publish', 'published', 'failed')
  ),
  review_flag_count integer not null default 0 check (review_flag_count >= 0),
  extraction_document jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.import_files (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.import_jobs(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  kind text not null check (kind in ('paper', 'answer_key', 'solution')),
  created_at timestamptz not null default now()
);

create table public.attempts (
  id uuid primary key,
  user_id uuid not null references public.profiles(id),
  paper_version_id text not null references public.paper_versions(id) on delete restrict,
  mode text not null check (mode in ('mock', 'practice')),
  strict boolean not null,
  attempt_number integer not null check (attempt_number > 0),
  visibility text not null check (visibility in ('public', 'private')),
  integrity_status text not null check (integrity_status in ('clear', 'flagged')),
  started_at timestamptz not null,
  deadline_at timestamptz not null,
  submitted_at timestamptz,
  submission_reason text check (submission_reason in ('manual', 'expired')),
  request_fingerprint text not null,
  creation_idempotency_key text not null,
  submitted_response jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, creation_idempotency_key),
  unique (user_id, paper_version_id, mode, strict, attempt_number),
  check (deadline_at > started_at),
  check ((submitted_at is null) = (submitted_response is null))
);

create index attempts_active_deadline_idx
on public.attempts (deadline_at)
where submitted_at is null;

create index attempts_leaderboard_idx
on public.attempts (paper_version_id, attempt_number, visibility, integrity_status)
where mode = 'mock' and strict and submitted_at is not null;

create table public.answer_events (
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  id text not null,
  question_id text not null,
  event_type text not null check (event_type in ('answer_selected', 'answer_cleared')),
  selected_option_id text,
  occurred_at_ms bigint not null check (occurred_at_ms >= 0),
  client_sequence integer not null check (client_sequence > 0),
  received_at timestamptz not null default now(),
  primary key (attempt_id, id),
  check (
    (event_type = 'answer_selected' and selected_option_id is not null)
    or (event_type = 'answer_cleared' and selected_option_id is null)
  )
);

create index answer_events_replay_idx
on public.answer_events (attempt_id, client_sequence, occurred_at_ms);

create table public.attempt_results (
  attempt_id uuid primary key references public.attempts(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  paper_version_id text not null references public.paper_versions(id) on delete restrict,
  score integer not null,
  max_score integer not null check (max_score >= 0),
  correct integer not null check (correct >= 0),
  incorrect integer not null check (incorrect >= 0),
  result jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.papers enable row level security;
alter table public.paper_versions enable row level security;
alter table public.import_jobs enable row level security;
alter table public.import_files enable row level security;
alter table public.attempts enable row level security;
alter table public.answer_events enable row level security;
alter table public.attempt_results enable row level security;

create policy profiles_read_self on public.profiles
for select to authenticated using (id = auth.uid());
create policy profiles_update_self on public.profiles
for update to authenticated using (id = auth.uid())
with check (id = auth.uid());

revoke update on public.profiles from authenticated;
grant update (display_name, hide_display_name, updated_at) on public.profiles to authenticated;

create policy papers_read on public.papers
for select to anon, authenticated using (true);
create policy papers_admin_all on public.papers
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy published_versions_read on public.paper_versions
for select to anon, authenticated using (status = 'published' or public.is_admin());
create policy paper_versions_admin_insert on public.paper_versions
for insert to authenticated with check (public.is_admin());
create policy paper_versions_admin_update on public.paper_versions
for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy paper_versions_admin_delete on public.paper_versions
for delete to authenticated using (public.is_admin());

create policy import_jobs_admin_all on public.import_jobs
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy import_files_admin_all on public.import_files
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy attempts_read_own on public.attempts
for select to authenticated using (user_id = auth.uid());
create policy attempts_insert_own on public.attempts
for insert to authenticated with check (user_id = auth.uid());
create policy attempts_update_own on public.attempts
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy answer_events_read_own on public.answer_events
for select to authenticated using (
  exists (select 1 from public.attempts where attempts.id = attempt_id and attempts.user_id = auth.uid())
);
create policy answer_events_insert_own on public.answer_events
for insert to authenticated with check (
  exists (
    select 1 from public.attempts
    where attempts.id = attempt_id
      and attempts.user_id = auth.uid()
      and attempts.submitted_at is null
  )
);

create policy attempt_results_read_own on public.attempt_results
for select to authenticated using (user_id = auth.uid());

create or replace function public.get_leaderboard(p_paper_version_id text)
returns table (
  rank bigint,
  display_name text,
  score integer,
  max_score integer,
  correct integer,
  incorrect integer,
  total_time_ms bigint,
  submitted_at timestamptz,
  percentile numeric
)
language sql
stable
security definer set search_path = ''
as $$
  with eligible as (
    select
      a.id,
      case when p.hide_display_name then 'Anonymous aspirant' else p.display_name end as display_name,
      r.score,
      r.max_score,
      r.correct,
      r.incorrect,
      greatest(
        0,
        floor(extract(epoch from (a.submitted_at - a.started_at)) * 1000)
      )::bigint as total_time_ms,
      a.submitted_at
    from public.attempts a
    join public.attempt_results r on r.attempt_id = a.id
    join public.profiles p on p.id = a.user_id
    where a.paper_version_id = p_paper_version_id
      and a.mode = 'mock'
      and a.strict
      and a.attempt_number = 1
      and a.visibility = 'public'
      and a.integrity_status = 'clear'
      and a.submitted_at is not null
  ), ranked as (
    select
      row_number() over (
        order by score desc, correct desc, incorrect asc, total_time_ms asc, submitted_at asc, id asc
      ) as rank,
      eligible.*,
      count(*) over () as eligible_count,
      cume_dist() over (order by score asc) * 100 as percentile_value
    from eligible
  )
  select
    rank,
    display_name,
    score,
    max_score,
    correct,
    incorrect,
    total_time_ms,
    submitted_at,
    case when eligible_count >= 100 then round(percentile_value::numeric, 2) end as percentile
  from ranked
  order by rank;
$$;

revoke all on function public.get_leaderboard(text) from public;
grant execute on function public.get_leaderboard(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'paper-imports',
  'paper-imports',
  false,
  52428800,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy paper_imports_admin_read on storage.objects
for select to authenticated using (bucket_id = 'paper-imports' and public.is_admin());
create policy paper_imports_admin_insert on storage.objects
for insert to authenticated with check (bucket_id = 'paper-imports' and public.is_admin());
create policy paper_imports_admin_update on storage.objects
for update to authenticated using (bucket_id = 'paper-imports' and public.is_admin())
with check (bucket_id = 'paper-imports' and public.is_admin());
create policy paper_imports_admin_delete on storage.objects
for delete to authenticated using (bucket_id = 'paper-imports' and public.is_admin());
