create table public.cv_role_fit_overrides(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  job_posting_id uuid not null references public.job_postings(id) on delete cascade,
  analysis_hash text not null check(length(analysis_hash)=64),
  decision text not null check(decision in ('BORDERLINE','BLOCKED_HARD_GAP')),
  reason text not null check(length(trim(reason)) between 12 and 2000),
  acknowledged_gaps jsonb not null check(jsonb_typeof(acknowledged_gaps)='array'),
  created_at timestamptz not null default now(),
  unique(user_id,job_posting_id,analysis_hash)
);

alter table public.cv_role_fit_overrides enable row level security;

create policy cv_role_fit_overrides_select_own on public.cv_role_fit_overrides
for select to authenticated
using((select auth.uid())=user_id);

create policy cv_role_fit_overrides_insert_own on public.cv_role_fit_overrides
for insert to authenticated
with check((select auth.uid())=user_id);

revoke all on public.cv_role_fit_overrides from anon;
grant select,insert on public.cv_role_fit_overrides to authenticated;

create or replace function private.reject_cv_role_fit_override_mutation()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  raise exception 'CV_ROLE_FIT_OVERRIDE_IMMUTABLE';
end;
$$;

revoke all on function private.reject_cv_role_fit_override_mutation() from public;

create trigger cv_role_fit_overrides_immutable
before update or delete on public.cv_role_fit_overrides
for each row execute function private.reject_cv_role_fit_override_mutation();
