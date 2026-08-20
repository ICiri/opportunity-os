-- P1 real-provider hunter runtime. This migration is intentionally separate
-- from V3 and is not applied automatically by the application.

alter table public.sources drop constraint if exists sources_registry_status_check;
alter table public.sources
  add constraint sources_registry_status_check
  check (registry_status in ('LIVE','DEGRADED','RESEARCH','BLOCKED','DISCONNECTED'));

insert into public.sources(
  name, country, base_url, type, priority, enabled, adapter_name,
  capabilities, terms_checked, robots_checked, registry_status,
  coverage_regions, health_score, status_note
) values
  (
    'Greenhouse official Job Board API', 'MULTI',
    'https://boards-api.greenhouse.io/v1/boards/', 'ATS', 'A', false,
    'greenhouse-public-v1',
    '{"published_jobs":true,"applications":false,"requires_tenant":true}'::jsonb,
    false, false, 'DISCONNECTED', '{}', 0,
    'Adapter implemented; enable only after one or more board tokens are configured.'
  ),
  (
    'Lever official Postings API', 'MULTI',
    'https://api.lever.co/v0/postings/', 'ATS', 'A', false,
    'lever-public-v0',
    '{"published_jobs":true,"applications":false,"requires_tenant":true}'::jsonb,
    false, false, 'DISCONNECTED', '{}', 0,
    'Adapter implemented; enable only after one or more public site names are configured.'
  )
on conflict (name, country) do update set
  base_url = excluded.base_url,
  type = excluded.type,
  priority = excluded.priority,
  enabled = excluded.enabled,
  adapter_name = excluded.adapter_name,
  capabilities = excluded.capabilities,
  registry_status = excluded.registry_status,
  health_score = excluded.health_score,
  status_note = excluded.status_note;

alter table public.search_runs
  add column idempotency_key text;

create unique index search_runs_user_idempotency_idx
  on public.search_runs(user_id, idempotency_key)
  where idempotency_key is not null and status <> 'CANCELLED';

alter table public.job_postings
  add column availability_status text not null default 'UNKNOWN',
  add column eligibility_reason text,
  add column eligibility_evidence jsonb not null default '[]'::jsonb,
  add column published_at timestamptz,
  add column source_updated_at timestamptz,
  add column closed_at timestamptz,
  add column scoring_status text not null default 'INSUFFICIENT_DATA',
  add column scoring_version text not null default 'hunter-economic-v1';

alter table public.job_postings
  add constraint job_postings_availability_check
    check (availability_status in ('LIVE','UNKNOWN','CLOSED')),
  add constraint job_postings_scoring_status_check
    check (scoring_status in ('SCORED','INSUFFICIENT_DATA')),
  add constraint job_postings_closed_state_check
    check ((availability_status = 'CLOSED' and closed_at is not null) or availability_status <> 'CLOSED');

alter table public.hunt_run_metrics
  add column canonical_jobs integer not null default 0,
  add column likely_eligible_jobs integer not null default 0,
  add column unknown_eligibility_jobs integer not null default 0,
  add column ineligible_jobs integer not null default 0,
  add column economically_scored_jobs integer not null default 0;

alter table public.hunt_run_metrics
  add constraint hunt_run_metrics_p1_nonnegative_check check (
    canonical_jobs >= 0 and likely_eligible_jobs >= 0
    and unknown_eligibility_jobs >= 0 and ineligible_jobs >= 0
    and economically_scored_jobs >= 0
  );

comment on column public.sources.registry_status is
  'LIVE requires a successful current runtime check. DISCONNECTED means configured or available adapter without a successful connection.';
comment on column public.job_postings.availability_status is
  'Availability is independent from posting age; OLD does not mean CLOSED.';
comment on column public.search_runs.idempotency_key is
  'Stable trigger identity, for example DAILY_HUNT:2026-08-16 in Europe/Zagreb.';
