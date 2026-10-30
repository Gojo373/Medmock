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
    status in ('uploading', 'uploaded', 'extracting', 'review_required', 'ready_to_publish', 'published', 'failed')
  ),
  review_flag_count integer not null default 0 check (review_flag_count >= 0),
  extraction_document jsonb,
  reconciled_document jsonb,
  reviewed_document jsonb,
  error_code text,
  error_detail text,
  processing_attempts integer not null default 0 check (processing_attempts >= 0),
  lease_owner text,
  lease_expires_at timestamptz,
  next_retry_at timestamptz,
  published_original_version_id text references public.paper_versions(id) on delete restrict,
  published_current_version_id text references public.paper_versions(id) on delete restrict,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((lease_owner is null) = (lease_expires_at is null)),
  check ((approved_by is null) = (approved_at is null))
);

create index import_jobs_worker_idx
on public.import_jobs (status, next_retry_at, lease_expires_at, created_at);

create or replace function public.claim_import_job(
  p_worker_id text,
  p_lease_seconds integer default 300
)
returns setof public.import_jobs
language plpgsql
security definer set search_path = ''
as $$
declare
  claimed_id uuid;
begin
  if coalesce(trim(p_worker_id), '') = '' or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'Invalid import worker lease.' using errcode = '22023';
  end if;

  select id into claimed_id
  from public.import_jobs
  where processing_attempts < 5
    and (
      status = 'uploaded'
      or (status = 'failed' and coalesce(next_retry_at, now()) <= now())
      or (status = 'extracting' and lease_expires_at < now())
    )
  order by created_at
  for update skip locked
  limit 1;

  if claimed_id is null then
    return;
  end if;

  return query
  update public.import_jobs
  set status = 'extracting',
      processing_attempts = processing_attempts + 1,
      lease_owner = p_worker_id,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      error_code = null,
      error_detail = null,
      updated_at = now()
  where id = claimed_id
  returning *;
end;
$$;

create or replace function public.publish_import_versions(
  p_import_id uuid,
  p_admin_id uuid,
  p_paper_id text,
  p_original_version jsonb,
  p_current_version jsonb
)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  import_row public.import_jobs%rowtype;
  paper_owner uuid;
  original_id text := p_original_version ->> 'id';
  current_id text := p_current_version ->> 'id';
  original_revision integer := (p_original_version ->> 'revision')::integer;
  current_revision integer := (p_current_version ->> 'revision')::integer;
  existing_content jsonb;
begin
  if not exists (
    select 1 from public.profiles where id = p_admin_id and role = 'admin'
  ) then
    raise exception 'Admin approval is required.' using errcode = '42501';
  end if;

  select * into import_row
  from public.import_jobs
  where id = p_import_id and owner_id = p_admin_id
  for update;

  if not found then
    raise exception 'Import was not found.' using errcode = 'P0002';
  end if;

  if import_row.status = 'published' then
    if import_row.published_original_version_id = original_id
      and import_row.published_current_version_id = current_id then
      return jsonb_build_object(
        'originalVersionId', original_id,
        'currentVersionId', current_id
      );
    end if;
    raise exception 'Import was already published with different versions.' using errcode = '55000';
  end if;

  if import_row.status <> 'ready_to_publish'
    or import_row.reviewed_document is null
    or jsonb_path_exists(
      import_row.reviewed_document,
      '$.reviewFlags[*] ? (@.resolved == false)'
    ) then
    raise exception 'Import is not ready to publish.' using errcode = '55000';
  end if;

  if coalesce(trim(p_paper_id), '') = ''
    or original_id is null
    or current_id is null
    or original_id = current_id
    or original_revision = current_revision
    or p_original_version ->> 'paperId' <> p_paper_id
    or p_current_version ->> 'paperId' <> p_paper_id
    or p_original_version ->> 'pattern' <> 'original'
    or p_current_version ->> 'pattern' <> 'current'
    or p_original_version ->> 'status' <> 'published'
    or p_current_version ->> 'status' <> 'published' then
    raise exception 'Published version metadata is invalid.' using errcode = '22023';
  end if;

  insert into public.papers (id, owner_id, title)
  values (p_paper_id, p_admin_id, p_original_version -> 'title')
  on conflict (id) do nothing;

  select owner_id into paper_owner from public.papers where id = p_paper_id;
  if paper_owner <> p_admin_id then
    raise exception 'Paper belongs to another administrator.' using errcode = '42501';
  end if;

  insert into public.paper_versions (
    id, paper_id, revision, status, content, published_at, created_by
  ) values (
    original_id,
    p_paper_id,
    original_revision,
    'published',
    p_original_version,
    (p_original_version ->> 'publishedAt')::timestamptz,
    p_admin_id
  ) on conflict (id) do nothing;

  select content into existing_content from public.paper_versions where id = original_id;
  if existing_content is distinct from p_original_version then
    raise exception 'Original version identifier already has different content.' using errcode = '23505';
  end if;

  insert into public.paper_versions (
    id, paper_id, revision, status, content, published_at, created_by
  ) values (
    current_id,
    p_paper_id,
    current_revision,
    'published',
    p_current_version,
    (p_current_version ->> 'publishedAt')::timestamptz,
    p_admin_id
  ) on conflict (id) do nothing;

  select content into existing_content from public.paper_versions where id = current_id;
  if existing_content is distinct from p_current_version then
    raise exception 'Current version identifier already has different content.' using errcode = '23505';
  end if;

  update public.import_jobs
  set status = 'published',
      published_original_version_id = original_id,
      published_current_version_id = current_id,
      approved_by = p_admin_id,
      approved_at = now(),
      updated_at = now()
  where id = p_import_id;

  return jsonb_build_object(
    'originalVersionId', original_id,
    'currentVersionId', current_id
  );
end;
$$;

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
  event_type text not null check (event_type in ('answer_selected', 'answer_cleared', 'time_spent')),
  selected_option_id text,
  occurred_at_ms bigint not null check (occurred_at_ms >= 0),
  client_sequence integer not null check (client_sequence > 0),
  time_spent_ms bigint not null default 0 check (time_spent_ms >= 0),
  received_at timestamptz not null default now(),
  primary key (attempt_id, id),
  check (
    (event_type = 'answer_selected' and selected_option_id is not null)
    or (event_type in ('answer_cleared', 'time_spent') and selected_option_id is null)
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

create policy published_versions_admin_read on public.paper_versions
for select to authenticated using (public.is_admin());
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

create policy answer_events_read_own on public.answer_events
for select to authenticated using (
  exists (select 1 from public.attempts where attempts.id = attempt_id and attempts.user_id = auth.uid())
);
create policy attempt_results_read_own on public.attempt_results
for select to authenticated using (user_id = auth.uid());

revoke insert, update, delete on public.attempts from anon, authenticated;
revoke insert, update, delete on public.answer_events from anon, authenticated;
revoke insert, update, delete on public.attempt_results from anon, authenticated;

create or replace function public.append_attempt_events(
  p_attempt_id uuid,
  p_user_id uuid,
  p_events jsonb
)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  attempt_row public.attempts%rowtype;
  event_value jsonb;
  existing public.answer_events%rowtype;
  accepted_ids jsonb := '[]'::jsonb;
  duplicate_ids jsonb := '[]'::jsonb;
  event_count integer;
begin
  select * into attempt_row
  from public.attempts
  where id = p_attempt_id and user_id = p_user_id
  for update;

  if not found then return jsonb_build_object('error', 'attempt_not_found'); end if;
  if attempt_row.submitted_at is not null then
    return jsonb_build_object('error', 'attempt_submitted');
  end if;

  for event_value in select value from jsonb_array_elements(p_events)
  loop
    if to_timestamp((event_value ->> 'occurredAt')::double precision / 1000.0) > attempt_row.deadline_at then
      return jsonb_build_object('error', 'event_after_deadline', 'eventId', event_value ->> 'id');
    end if;

    select * into existing from public.answer_events
    where attempt_id = p_attempt_id and id = event_value ->> 'id';

    if found then
      if existing.question_id <> event_value ->> 'questionId'
        or existing.event_type <> event_value ->> 'type'
        or coalesce(existing.selected_option_id, '') <> coalesce(event_value ->> 'selectedOptionId', '')
        or existing.occurred_at_ms <> (event_value ->> 'occurredAt')::bigint
        or existing.client_sequence <> (event_value ->> 'clientSequence')::integer
        or existing.time_spent_ms <> coalesce((event_value ->> 'timeSpentMs')::bigint, 0) then
        return jsonb_build_object('error', 'answer_event_conflict', 'eventId', event_value ->> 'id');
      end if;
      duplicate_ids := duplicate_ids || jsonb_build_array(event_value ->> 'id');
    else
      if attempt_row.mode = 'practice'
        and event_value ->> 'type' = 'answer_selected'
        and exists (
        select 1 from public.answer_events
        where attempt_id = p_attempt_id
          and question_id = event_value ->> 'questionId'
          and event_type = 'answer_selected'
      ) then
        return jsonb_build_object('error', 'practice_answer_locked', 'eventId', event_value ->> 'id');
      end if;

      insert into public.answer_events (
        attempt_id, id, question_id, event_type, selected_option_id,
        occurred_at_ms, client_sequence, time_spent_ms
      ) values (
        p_attempt_id,
        event_value ->> 'id',
        event_value ->> 'questionId',
        event_value ->> 'type',
        event_value ->> 'selectedOptionId',
        (event_value ->> 'occurredAt')::bigint,
        (event_value ->> 'clientSequence')::integer,
        coalesce((event_value ->> 'timeSpentMs')::bigint, 0)
      );
      accepted_ids := accepted_ids || jsonb_build_array(event_value ->> 'id');
    end if;
  end loop;

  select count(*) into event_count from public.answer_events where attempt_id = p_attempt_id;
  return jsonb_build_object(
    'acceptedEventIds', accepted_ids,
    'duplicateEventIds', duplicate_ids,
    'eventCount', event_count
  );
end;
$$;

create or replace function public.finalize_attempt(
  p_attempt_id uuid,
  p_user_id uuid,
  p_expected_event_count integer,
  p_submitted_at timestamptz,
  p_submission_reason text,
  p_response jsonb,
  p_result jsonb,
  p_score integer,
  p_max_score integer,
  p_correct integer,
  p_incorrect integer
)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  attempt_row public.attempts%rowtype;
  actual_event_count integer;
begin
  select * into attempt_row
  from public.attempts
  where id = p_attempt_id and user_id = p_user_id
  for update;

  if not found then return jsonb_build_object('error', 'attempt_not_found'); end if;
  if attempt_row.submitted_response is not null then
    return jsonb_build_object('response', attempt_row.submitted_response);
  end if;

  select count(*) into actual_event_count
  from public.answer_events where attempt_id = p_attempt_id;
  if actual_event_count <> p_expected_event_count then
    return jsonb_build_object('error', 'event_count_changed');
  end if;

  insert into public.attempt_results (
    attempt_id, user_id, paper_version_id, score, max_score, correct, incorrect, result
  ) values (
    p_attempt_id, p_user_id, attempt_row.paper_version_id,
    p_score, p_max_score, p_correct, p_incorrect, p_result
  );

  update public.attempts set
    submitted_at = p_submitted_at,
    submission_reason = p_submission_reason,
    submitted_response = p_response
  where id = p_attempt_id;

  return jsonb_build_object('response', p_response);
end;
$$;

revoke all on function public.append_attempt_events(uuid, uuid, jsonb) from public;
revoke all on function public.finalize_attempt(uuid, uuid, integer, timestamptz, text, jsonb, jsonb, integer, integer, integer, integer) from public;
revoke all on function public.claim_import_job(text, integer) from public;
revoke all on function public.publish_import_versions(uuid, uuid, text, jsonb, jsonb) from public;
grant execute on function public.append_attempt_events(uuid, uuid, jsonb) to service_role;
grant execute on function public.finalize_attempt(uuid, uuid, integer, timestamptz, text, jsonb, jsonb, integer, integer, integer, integer) to service_role;
grant execute on function public.claim_import_job(text, integer) to service_role;
grant execute on function public.publish_import_versions(uuid, uuid, text, jsonb, jsonb) to service_role;

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
grant execute on function public.get_leaderboard(text) to service_role;

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
