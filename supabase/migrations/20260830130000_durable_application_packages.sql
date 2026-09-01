alter table public.job_postings
  add constraint job_postings_id_user_unique unique(id,user_id);

alter table public.opportunities
  add constraint opportunities_id_user_unique unique(id,user_id);

alter table public.job_snapshots
  add constraint job_snapshots_id_posting_unique unique(id,job_posting_id);

alter table public.cv_role_fit_overrides
  add constraint cv_role_fit_overrides_id_user_unique unique(id,user_id);

create table public.application_packages(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  opportunity_id uuid,
  job_posting_id uuid not null,
  job_snapshot_id uuid not null,
  cv_version_id uuid not null,
  role_fit_override_id uuid,
  supersedes_package_id uuid,
  canonical_opportunity_key text not null check(length(trim(canonical_opportunity_key)) between 8 and 500),
  company_canonical_name text not null check(length(trim(company_canonical_name)) between 1 and 300),
  source_snapshot_hash text not null check(source_snapshot_hash ~ '^[0-9a-f]{64}$'),
  recipient_hash text not null check(recipient_hash ~ '^[0-9a-f]{64}$'),
  recipient_domain text not null check(recipient_domain = lower(recipient_domain) and recipient_domain like '%.%'),
  recipient_verified_at timestamptz not null,
  recipient_verification_evidence jsonb not null check(jsonb_typeof(recipient_verification_evidence)='array'),
  subject_hash text not null check(subject_hash ~ '^[0-9a-f]{64}$'),
  body_hash text not null check(body_hash ~ '^[0-9a-f]{64}$'),
  cv_content_hash text not null check(cv_content_hash ~ '^[0-9a-f]{64}$'),
  attachment_filename text not null check(lower(attachment_filename) like '%.pdf'),
  attachment_mime_type text not null default 'application/pdf' check(attachment_mime_type='application/pdf'),
  attachment_sha256 text not null check(attachment_sha256 ~ '^[0-9a-f]{64}$'),
  attachment_byte_length bigint not null check(attachment_byte_length between 1 and 10485760),
  role_fit_hash text not null check(role_fit_hash ~ '^[0-9a-f]{64}$'),
  package_content_hash text not null check(package_content_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null check(length(idempotency_key) between 16 and 300),
  current_state text not null default 'PACKAGE_DRAFT' check(current_state in (
    'DISCOVERED','QUALIFIED','PACKAGE_DRAFT','REVIEW_REQUIRED','APPROVED',
    'PREFLIGHT_READY','SENDING','SENT','FAILED','CANCELLED'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,user_id),
  unique(user_id,package_content_hash),
  unique(user_id,idempotency_key),
  foreign key(opportunity_id,user_id) references public.opportunities(id,user_id) on delete restrict,
  foreign key(job_posting_id,user_id) references public.job_postings(id,user_id) on delete restrict,
  foreign key(job_snapshot_id,job_posting_id) references public.job_snapshots(id,job_posting_id) on delete restrict,
  foreign key(cv_version_id,user_id) references public.cv_versions(id,user_id) on delete restrict,
  foreign key(role_fit_override_id,user_id) references public.cv_role_fit_overrides(id,user_id) on delete restrict,
  foreign key(supersedes_package_id,user_id) references public.application_packages(id,user_id) on delete restrict
);

create table private.application_package_payloads(
  package_id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  recipient_ciphertext bytea not null,
  recipient_nonce bytea not null,
  recipient_aad_hash text not null check(recipient_aad_hash ~ '^[0-9a-f]{64}$'),
  subject_ciphertext bytea not null,
  subject_nonce bytea not null,
  subject_aad_hash text not null check(subject_aad_hash ~ '^[0-9a-f]{64}$'),
  body_ciphertext bytea not null,
  body_nonce bytea not null,
  body_aad_hash text not null check(body_aad_hash ~ '^[0-9a-f]{64}$'),
  pdf_ciphertext bytea not null,
  pdf_nonce bytea not null,
  pdf_aad_hash text not null check(pdf_aad_hash ~ '^[0-9a-f]{64}$'),
  encryption_key_version integer not null default 1 check(encryption_key_version > 0),
  created_at timestamptz not null default now(),
  foreign key(package_id,user_id) references public.application_packages(id,user_id) on delete cascade,
  check(
    octet_length(recipient_nonce)=12 and octet_length(subject_nonce)=12
    and octet_length(body_nonce)=12 and octet_length(pdf_nonce)=12
    and octet_length(recipient_ciphertext)>16 and octet_length(subject_ciphertext)>16
    and octet_length(body_ciphertext)>16 and octet_length(pdf_ciphertext)>16
  )
);

create table public.application_package_approvals(
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null,
  user_id uuid not null references public.users(id) on delete cascade,
  package_content_hash text not null check(package_content_hash ~ '^[0-9a-f]{64}$'),
  approval_hash text not null unique check(approval_hash ~ '^[0-9a-f]{64}$'),
  approved_by uuid not null references public.users(id) on delete restrict,
  approved_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(package_id,package_content_hash),
  foreign key(package_id,user_id) references public.application_packages(id,user_id) on delete cascade,
  check(approved_by=user_id)
);

create table public.application_package_preflights(
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null,
  user_id uuid not null references public.users(id) on delete cascade,
  package_content_hash text not null check(package_content_hash ~ '^[0-9a-f]{64}$'),
  preflight_hash text not null unique check(preflight_hash ~ '^[0-9a-f]{64}$'),
  reconciled_at timestamptz not null,
  findings jsonb not null check(jsonb_typeof(findings)='array'),
  allowed boolean not null,
  created_at timestamptz not null default now(),
  foreign key(package_id,user_id) references public.application_packages(id,user_id) on delete cascade,
  check(allowed=(jsonb_array_length(findings)=0))
);

create table public.application_package_state_events(
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null,
  user_id uuid not null references public.users(id) on delete cascade,
  package_content_hash text not null check(package_content_hash ~ '^[0-9a-f]{64}$'),
  from_state text,
  to_state text not null,
  source text not null check(length(trim(source)) between 2 and 100),
  evidence jsonb not null default '[]'::jsonb check(jsonb_typeof(evidence)='array'),
  occurred_at timestamptz not null default now(),
  foreign key(package_id,user_id) references public.application_packages(id,user_id) on delete cascade,
  check(from_state is null or from_state in (
    'DISCOVERED','QUALIFIED','PACKAGE_DRAFT','REVIEW_REQUIRED','APPROVED',
    'PREFLIGHT_READY','SENDING','SENT','FAILED','CANCELLED'
  )),
  check(to_state in (
    'DISCOVERED','QUALIFIED','PACKAGE_DRAFT','REVIEW_REQUIRED','APPROVED',
    'PREFLIGHT_READY','SENDING','SENT','FAILED','CANCELLED'
  ))
);

create table public.application_delivery_attempts(
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null,
  user_id uuid not null references public.users(id) on delete cascade,
  package_content_hash text not null check(package_content_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null check(length(idempotency_key) between 16 and 300),
  status text not null check(status in ('SENDING','SENT','FAILED','CANCELLED')),
  provider_message_id text,
  provider_thread_id text,
  error_code text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique(user_id,idempotency_key),
  foreign key(package_id,user_id) references public.application_packages(id,user_id) on delete restrict,
  check((status='SENDING' and finished_at is null) or (status<>'SENDING' and finished_at is not null)),
  check(status<>'SENT' or provider_message_id is not null)
);

create or replace function private.enforce_application_package_insert()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.current_state<>'PACKAGE_DRAFT' then
    raise exception 'APPLICATION_PACKAGE_INITIAL_STATE_INVALID:%',new.current_state;
  end if;
  return new;
end;
$$;

create or replace function private.enforce_application_package_update()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if (to_jsonb(new)-array['current_state','updated_at']) is distinct from
     (to_jsonb(old)-array['current_state','updated_at']) then
    raise exception 'APPLICATION_PACKAGE_CONTENT_IMMUTABLE';
  end if;
  if new.current_state=old.current_state then
    raise exception 'APPLICATION_PACKAGE_STATE_UNCHANGED';
  end if;
  if not (
    (old.current_state='DISCOVERED' and new.current_state in ('QUALIFIED','CANCELLED')) or
    (old.current_state='QUALIFIED' and new.current_state in ('PACKAGE_DRAFT','CANCELLED')) or
    (old.current_state='PACKAGE_DRAFT' and new.current_state in ('REVIEW_REQUIRED','CANCELLED')) or
    (old.current_state='REVIEW_REQUIRED' and new.current_state in ('APPROVED','CANCELLED')) or
    (old.current_state='APPROVED' and new.current_state in ('PREFLIGHT_READY','CANCELLED')) or
    (old.current_state='PREFLIGHT_READY' and new.current_state in ('APPROVED','SENDING','CANCELLED')) or
    (old.current_state='SENDING' and new.current_state in ('SENT','FAILED')) or
    (old.current_state='FAILED' and new.current_state in ('APPROVED','CANCELLED'))
  ) then
    raise exception 'APPLICATION_PACKAGE_TRANSITION_INVALID:%:%',old.current_state,new.current_state;
  end if;
  if new.current_state='APPROVED' and not exists(
    select 1 from public.application_package_approvals approval
    where approval.package_id=old.id and approval.user_id=old.user_id
      and approval.package_content_hash=old.package_content_hash
  ) then
    raise exception 'APPLICATION_PACKAGE_APPROVAL_MISSING';
  end if;
  if new.current_state in ('PREFLIGHT_READY','SENDING') and not exists(
    select 1 from public.application_package_preflights preflight
    where preflight.package_id=old.id and preflight.user_id=old.user_id
      and preflight.package_content_hash=old.package_content_hash and preflight.allowed
  ) then
    raise exception 'APPLICATION_PACKAGE_PREFLIGHT_MISSING';
  end if;
  new.updated_at=now();
  return new;
end;
$$;

create or replace function private.record_application_package_state_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  event_source text;
  event_evidence jsonb;
begin
  event_source=coalesce(nullif(current_setting('app.application_package_transition_source',true),''),
    case when tg_op='INSERT' then 'PACKAGE_CREATED' else 'DATABASE_TRANSITION' end);
  event_evidence=case
    when coalesce(current_setting('app.application_package_transition_evidence',true),'')=''
      then '[]'::jsonb
    else current_setting('app.application_package_transition_evidence',true)::jsonb
  end;
  insert into public.application_package_state_events(
    package_id,user_id,package_content_hash,from_state,to_state,source,evidence
  ) values(
    new.id,new.user_id,new.package_content_hash,
    case when tg_op='INSERT' then null else old.current_state end,
    new.current_state,event_source,event_evidence
  );
  return new;
end;
$$;

create or replace function private.reject_application_package_immutable_mutation()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  raise exception 'APPLICATION_PACKAGE_IMMUTABLE_RECORD';
end;
$$;

revoke all on function private.enforce_application_package_insert() from public;
revoke all on function private.enforce_application_package_update() from public;
revoke all on function private.record_application_package_state_event() from public;
revoke all on function private.reject_application_package_immutable_mutation() from public;

create trigger application_packages_insert_guard
before insert on public.application_packages
for each row execute function private.enforce_application_package_insert();

create trigger application_packages_update_guard
before update on public.application_packages
for each row execute function private.enforce_application_package_update();

create trigger application_packages_created_event
after insert on public.application_packages
for each row execute function private.record_application_package_state_event();

create trigger application_packages_transition_event
after update of current_state on public.application_packages
for each row execute function private.record_application_package_state_event();

create trigger application_package_payloads_immutable
before update or delete on private.application_package_payloads
for each row execute function private.reject_application_package_immutable_mutation();

create trigger application_package_approvals_immutable
before update or delete on public.application_package_approvals
for each row execute function private.reject_application_package_immutable_mutation();

create trigger application_package_preflights_immutable
before update or delete on public.application_package_preflights
for each row execute function private.reject_application_package_immutable_mutation();

create trigger application_package_state_events_immutable
before update or delete on public.application_package_state_events
for each row execute function private.reject_application_package_immutable_mutation();

create trigger application_delivery_attempts_immutable
before update or delete on public.application_delivery_attempts
for each row execute function private.reject_application_package_immutable_mutation();

create index application_packages_user_state_idx on public.application_packages(user_id,current_state,created_at desc);
create index application_packages_job_idx on public.application_packages(user_id,job_posting_id,created_at desc);
create index application_package_state_events_package_idx on public.application_package_state_events(package_id,occurred_at);
create index application_package_preflights_package_idx on public.application_package_preflights(package_id,created_at desc);
create index application_delivery_attempts_package_idx on public.application_delivery_attempts(package_id,started_at desc);
create index application_package_payloads_user_idx on private.application_package_payloads(user_id,created_at desc);

alter table public.application_packages enable row level security;
alter table public.application_package_approvals enable row level security;
alter table public.application_package_preflights enable row level security;
alter table public.application_package_state_events enable row level security;
alter table public.application_delivery_attempts enable row level security;
alter table private.application_package_payloads enable row level security;

create policy application_packages_select_own on public.application_packages
for select to authenticated using((select auth.uid())=user_id);

create policy application_package_approvals_select_own on public.application_package_approvals
for select to authenticated using((select auth.uid())=user_id);

create policy application_package_preflights_select_own on public.application_package_preflights
for select to authenticated using((select auth.uid())=user_id);

create policy application_package_state_events_select_own on public.application_package_state_events
for select to authenticated using((select auth.uid())=user_id);
create policy application_delivery_attempts_select_own on public.application_delivery_attempts
for select to authenticated using((select auth.uid())=user_id);

revoke all on public.application_packages,public.application_package_approvals,
  public.application_package_preflights,public.application_package_state_events,
  public.application_delivery_attempts from anon;
revoke all on private.application_package_payloads from anon,authenticated;

grant select on public.application_packages,public.application_package_approvals,
  public.application_package_preflights,public.application_package_state_events,
  public.application_delivery_attempts to authenticated;

grant select,insert,update,delete on public.application_packages,public.application_package_approvals,
  public.application_package_preflights,public.application_package_state_events,
  public.application_delivery_attempts to service_role;
grant select,insert,update,delete on private.application_package_payloads to service_role;
