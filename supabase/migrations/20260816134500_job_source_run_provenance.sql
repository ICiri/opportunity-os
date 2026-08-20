alter table public.job_sources
  add column last_search_run_id uuid references public.search_runs(id) on delete restrict;

create index job_sources_last_run_idx on public.job_sources(last_search_run_id,last_verified_at desc);

comment on column public.job_sources.last_search_run_id is
  'Most recent audited hunter run that observed this posting in its official parent feed.';
