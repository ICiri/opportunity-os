-- Opportunity OS V3: secure payload boundary, durable hunter scheduling,
-- source coverage, AI audit metadata and versioned application/bounty state.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

alter default privileges in schema private revoke all on tables from public, anon, authenticated;
alter default privileges in schema private revoke all on sequences from public, anon, authenticated;

-- The application data-encryption key is generated inside Supabase Vault. It
-- never appears in the repository, migration text, browser bundle or API rows.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'opportunity_data_key_v1') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'base64'),
      'opportunity_data_key_v1',
      'AES-256-GCM envelope key for private Opportunity OS payloads'
    );
  end if;
end $$;
revoke all on vault.secrets from anon, authenticated;
revoke all on vault.decrypted_secrets from anon, authenticated;

alter table public.sources
  add column registry_status text not null default 'RESEARCH',
  add column coverage_regions text[] not null default '{}',
  add column freshness_sla_hours integer not null default 24,
  add column verified_at timestamptz,
  add column last_http_status integer,
  add column terms_url text,
  add column robots_url text,
  add column rate_limit_policy text,
  add column status_note text;

alter table public.sources
  add constraint sources_registry_status_check
    check (registry_status in ('LIVE','DEGRADED','RESEARCH','BLOCKED','DISCONNECTED')),
  add constraint sources_freshness_sla_check
    check (freshness_sla_hours between 1 and 720),
  add constraint sources_http_status_check
    check (last_http_status is null or last_http_status between 100 and 599);

-- V3 has no runtime/demo source type. Recorded fixtures remain test-only and
-- can never enter the production source registry.
delete from public.sources where type = 'MOCK';
alter table public.sources drop constraint if exists sources_type_check;
alter table public.sources add constraint sources_type_check
  check (type in ('API','RSS','ATS','HTML','SEARCH','EMAIL','MANUAL'));

alter table public.search_runs add column scheduled_local_date date;

create unique index search_runs_one_daily_hunt_idx
  on public.search_runs(user_id, scheduled_local_date)
  where trigger_type = 'SCHEDULED'
    and scheduled_local_date is not null
    and status <> 'CANCELLED';

alter table public.job_sources
  add column last_verified_at timestamptz,
  add column verification_status text not null default 'UNKNOWN',
  add column http_status integer;

alter table public.job_sources
  add constraint job_sources_verification_status_check
    check (verification_status in ('LIVE','MISSING','EXPIRED','BLOCKED','UNKNOWN')),
  add constraint job_sources_http_status_check
    check (http_status is null or http_status between 100 and 599);

alter table public.cv_versions
  add column language text not null default 'EN',
  add column lifecycle text not null default 'DRAFT',
  add column opportunity_id uuid references public.opportunities(id) on delete set null,
  add column evidence_manifest jsonb not null default '[]'::jsonb,
  add column change_summary jsonb not null default '[]'::jsonb,
  add column generated_by text not null default 'MANUAL',
  add column approved_at timestamptz;

alter table public.cv_versions
  add constraint cv_versions_language_check check (language in ('EN','HR')),
  add constraint cv_versions_lifecycle_check check (lifecycle in ('DRAFT','APPROVED','ARCHIVED')),
  add constraint cv_versions_generated_by_check check (generated_by in ('MANUAL','OPENAI')),
  add constraint cv_versions_approval_check check (
    (lifecycle = 'APPROVED' and approved_at is not null)
    or (lifecycle <> 'APPROVED')
  );

-- The public email table retains non-sensitive delivery metadata only. Payloads
-- are stored encrypted in the unexposed private schema.
alter table public.email_messages add column user_id uuid;
update public.email_messages message
set user_id = thread.user_id
from public.email_threads thread
where thread.id = message.thread_id and message.user_id is null;
alter table public.email_messages alter column user_id set not null;
alter table public.email_messages
  add constraint email_messages_user_fk foreign key (user_id) references public.users(id) on delete cascade,
  add constraint email_messages_id_user_unique unique (id, user_id);

alter table public.cv_versions add constraint cv_versions_id_user_unique unique (id, user_id);

alter table public.email_messages
  add constraint email_messages_no_public_payload_check
  check (body_ciphertext is null);

comment on column public.email_messages.body_ciphertext is
  'Deprecated V2 column. Must remain NULL; encrypted payload is in private.gmail_message_payloads.';

create table public.source_country_coverage(
  id bigint generated always as identity primary key,
  source_id uuid not null references public.sources(id) on delete cascade,
  country_code text not null,
  work_modes text[] not null default '{}',
  eligibility_rule text not null default 'VERIFY',
  enabled boolean not null default true,
  last_verified_at timestamptz,
  unique(source_id, country_code)
);

create table public.hunt_schedules(
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  timezone text not null default 'Europe/Zagreb',
  local_time time not null default '11:00',
  cadence text not null default 'DAILY',
  enabled boolean not null default true,
  last_triggered_at timestamptz,
  next_trigger_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name),
  constraint hunt_schedules_cadence_check check (cadence = 'DAILY')
);

create table public.hunt_run_metrics(
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  search_run_id uuid not null references public.search_runs(id) on delete cascade,
  source_coverage integer not null default 0,
  live_sources integer not null default 0,
  countries_covered integer not null default 0,
  jobs_discovered integer not null default 0,
  fresh_jobs integer not null default 0,
  eligible_jobs integer not null default 0,
  high_fit_jobs integer not null default 0,
  bounty_programs_discovered integer not null default 0,
  captured_at timestamptz not null default now(),
  unique(search_run_id),
  constraint hunt_run_metrics_nonnegative_check check (
    source_coverage >= 0 and live_sources >= 0 and countries_covered >= 0
    and jobs_discovered >= 0 and fresh_jobs >= 0 and eligible_jobs >= 0
    and high_fit_jobs >= 0 and bounty_programs_discovered >= 0
  )
);

create table public.ai_runs(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  purpose text not null,
  provider text not null,
  model text not null,
  prompt_version text not null,
  status text not null,
  input_hash text not null,
  output_hash text,
  input_tokens integer,
  output_tokens integer,
  cached_tokens integer,
  latency_ms integer,
  error_code text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint ai_runs_purpose_check check (purpose in ('DAILY_BRIEF','CV_TAILOR','EMAIL_SUGGESTION')),
  constraint ai_runs_status_check check (status in ('QUEUED','RUNNING','SUCCESS','FAILED','REJECTED')),
  constraint ai_runs_usage_check check (
    coalesce(input_tokens, 0) >= 0 and coalesce(output_tokens, 0) >= 0
    and coalesce(cached_tokens, 0) >= 0 and coalesce(latency_ms, 0) >= 0
  )
);

create table public.application_stage_events(
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  source text not null,
  evidence jsonb not null default '[]'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint application_stage_events_to_stage_check check (to_stage in (
    'DISCOVERED','REVIEWED','CV_PREPARED','APPROVED','APPLIED','DELIVERED',
    'REPLIED','INTERVIEW','OFFER','REJECTED','DORMANT','WON'
  )),
  constraint application_stage_events_from_stage_check check (from_stage is null or from_stage in (
    'DISCOVERED','REVIEWED','CV_PREPARED','APPROVED','APPLIED','DELIVERED',
    'REPLIED','INTERVIEW','OFFER','REJECTED','DORMANT','WON'
  ))
);

create table public.bounty_scope_versions(
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  program_id uuid not null references public.bounty_programs(id) on delete cascade,
  version integer not null,
  source_url text not null,
  source_hash text not null,
  safe_harbor_status text not null default 'UNKNOWN',
  automation_policy text not null default 'UNKNOWN',
  in_scope jsonb not null default '[]'::jsonb,
  out_of_scope jsonb not null default '[]'::jsonb,
  verified_at timestamptz not null,
  superseded_at timestamptz,
  unique(program_id, version),
  constraint bounty_scope_versions_version_check check (version > 0),
  constraint bounty_scope_versions_safe_harbor_check check (safe_harbor_status in ('YES','NO','UNKNOWN')),
  constraint bounty_scope_versions_automation_check check (automation_policy in ('ALLOWED','RESTRICTED','FORBIDDEN','UNKNOWN'))
);

create table private.gmail_connections(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider_account_id text not null,
  email_address_ciphertext bytea not null,
  email_address_nonce bytea not null,
  refresh_token_ciphertext bytea not null,
  refresh_token_nonce bytea not null,
  scopes text[] not null,
  encryption_key_version integer not null,
  token_expires_at timestamptz,
  history_id text,
  last_synced_at timestamptz,
  sync_status text not null default 'CONNECTED',
  last_sync_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, provider_account_id),
  constraint gmail_connections_nonce_size_check check (
    octet_length(email_address_nonce) = 12 and octet_length(refresh_token_nonce) = 12
  ),
  constraint gmail_connections_sync_status_check check (
    sync_status in ('CONNECTED','SYNCING','ERROR','REVOKED')
  )
);

create table private.gmail_message_payloads(
  message_id text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  subject_ciphertext bytea,
  subject_nonce bytea,
  body_ciphertext bytea not null,
  body_nonce bytea not null,
  aad_hash text not null,
  encryption_key_version integer not null,
  imported_at timestamptz not null default now(),
  foreign key (message_id, user_id) references public.email_messages(id, user_id) on delete cascade,
  constraint gmail_message_payloads_nonce_size_check check (
    (subject_ciphertext is null and subject_nonce is null)
    or (subject_ciphertext is not null and octet_length(subject_nonce) = 12)
  ),
  constraint gmail_message_payloads_body_nonce_size_check check (octet_length(body_nonce) = 12)
);

create table private.cv_payloads(
  cv_version_id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  document_ciphertext bytea not null,
  document_nonce bytea not null,
  aad_hash text not null,
  encryption_key_version integer not null,
  created_at timestamptz not null default now(),
  foreign key (cv_version_id, user_id) references public.cv_versions(id, user_id) on delete cascade,
  constraint cv_payloads_nonce_size_check check (octet_length(document_nonce) = 12)
);

alter table public.ai_runs add constraint ai_runs_id_user_unique unique (id, user_id);

create table private.ai_payloads(
  ai_run_id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  input_ciphertext bytea not null,
  input_nonce bytea not null,
  output_ciphertext bytea,
  output_nonce bytea,
  aad_hash text not null,
  encryption_key_version integer not null,
  created_at timestamptz not null default now(),
  foreign key (ai_run_id, user_id) references public.ai_runs(id, user_id) on delete cascade,
  constraint ai_payloads_nonce_size_check check (
    octet_length(input_nonce) = 12
    and ((output_ciphertext is null and output_nonce is null)
      or (output_ciphertext is not null and octet_length(output_nonce) = 12))
  )
);

create table private.gmail_attachments(
  id uuid primary key default gen_random_uuid(),
  message_id text not null,
  user_id uuid not null references public.users(id) on delete cascade,
  gmail_attachment_id_ciphertext bytea not null,
  attachment_id_nonce bytea not null,
  filename_ciphertext bytea not null,
  filename_nonce bytea not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 0 and 26214400),
  storage_path text,
  content_hash text,
  encryption_key_version integer not null,
  created_at timestamptz not null default now(),
  foreign key (message_id, user_id) references public.email_messages(id, user_id) on delete cascade,
  constraint gmail_attachments_nonce_size_check check (
    octet_length(attachment_id_nonce) = 12 and octet_length(filename_nonce) = 12
  )
);

create index source_country_coverage_source_idx on public.source_country_coverage(source_id, enabled, country_code);
create index hunt_schedules_due_idx on public.hunt_schedules(enabled, next_trigger_at) where enabled;
create index hunt_run_metrics_user_date_idx on public.hunt_run_metrics(user_id, captured_at desc);
create index ai_runs_user_purpose_idx on public.ai_runs(user_id, purpose, created_at desc);
create index application_stage_events_application_idx on public.application_stage_events(application_id, occurred_at desc);
create index application_stage_events_user_idx on public.application_stage_events(user_id, occurred_at desc);
create index bounty_scope_versions_program_idx on public.bounty_scope_versions(program_id, version desc);
create index cv_versions_opportunity_idx on public.cv_versions(opportunity_id) where opportunity_id is not null;
create index gmail_connections_user_idx on private.gmail_connections(user_id);
create index gmail_message_payloads_user_idx on private.gmail_message_payloads(user_id);
create index cv_payloads_user_idx on private.cv_payloads(user_id);
create index ai_payloads_user_idx on private.ai_payloads(user_id);
create index gmail_attachments_message_idx on private.gmail_attachments(user_id, message_id);

alter table public.source_country_coverage enable row level security;
alter table public.hunt_schedules enable row level security;
alter table public.hunt_run_metrics enable row level security;
alter table public.ai_runs enable row level security;
alter table public.application_stage_events enable row level security;
alter table public.bounty_scope_versions enable row level security;
alter table private.gmail_connections enable row level security;
alter table private.gmail_message_payloads enable row level security;
alter table private.cv_payloads enable row level security;
alter table private.ai_payloads enable row level security;
alter table private.gmail_attachments enable row level security;

create policy source_country_coverage_read on public.source_country_coverage
  for select to authenticated using (true);
create policy hunt_schedules_owner on public.hunt_schedules
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy hunt_run_metrics_owner on public.hunt_run_metrics
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy ai_runs_owner on public.ai_runs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy application_stage_events_owner on public.application_stage_events
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy bounty_scope_versions_owner on public.bounty_scope_versions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all privileges on all tables in schema public from anon, authenticated;
grant select on public.sources, public.source_country_coverage, public.principles, public.principle_versions to authenticated;
grant select, insert, update, delete on public.users, public.search_runs, public.companies,
  public.contacts, public.relationships, public.job_postings, public.opportunities,
  public.career_facts, public.cv_versions, public.applications, public.cover_letters,
  public.email_threads, public.followups, public.referrals, public.interviews,
  public.offers, public.revenues, public.bounty_programs, public.tasks,
  public.activity_events, public.audit_runs, public.conversation_strategy_versions,
  public.relationship_edges, public.relationship_node_metadata, public.message_experiments,
  public.design_audits, public.sales_plans, public.forecast_versions,
  public.account_targets, public.pipeline_stage_events, public.client_engagements,
  public.client_health_snapshots, public.value_deliveries, public.hunt_schedules,
  public.hunt_run_metrics, public.ai_runs, public.application_stage_events,
  public.bounty_scope_versions to authenticated;
grant usage, select on all sequences in schema public to authenticated;

grant select, insert, update, delete on all tables in schema private to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values
  ('cv-private', 'cv-private', false, 10485760, array['application/pdf']::text[]),
  ('gmail-attachments-private', 'gmail-attachments-private', false, 26214400, null)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Deliberately no browser policies for these buckets. Access must go through an
-- authenticated server route which returns a short-lived signed URL.
