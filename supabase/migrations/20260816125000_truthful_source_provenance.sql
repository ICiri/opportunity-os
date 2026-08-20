alter table public.sources alter column health_score set default 0;

alter table public.job_sources drop constraint if exists job_sources_verification_status_check;
alter table public.job_sources add constraint job_sources_verification_status_check
  check (verification_status in ('FEED_PRESENT','LIVE','MISSING','EXPIRED','BLOCKED','UNKNOWN'));

comment on column public.job_sources.verification_status is
  'FEED_PRESENT means the item appeared in a successfully fetched official ATS feed. LIVE is reserved for a direct listing URL verification.';
comment on column public.job_sources.http_status is
  'HTTP status for the check represented by verification_status; for FEED_PRESENT this is the parent feed response.';
comment on column public.sources.health_score is
  'Binary latest endpoint health: 100 only after a successful 2xx adapter response; 0 otherwise. Not a quality or market-coverage score.';

update public.job_sources set verification_status='FEED_PRESENT' where verification_status='LIVE';
update public.sources
set terms_checked=false,
    robots_checked=false,
    health_score=case when registry_status='LIVE' and last_http_status between 200 and 299 then 100 else 0 end,
    status_note=case
      when registry_status='LIVE' and last_http_status between 200 and 299
        then 'Latest official ATS feed request returned 2xx. Terms and robots review are not claimed.'
      else status_note
    end;
update public.search_runs set audit_status='LEGACY_UNVERIFIED' where audit_status='PASS';

revoke all privileges on all tables in schema public from anon;
