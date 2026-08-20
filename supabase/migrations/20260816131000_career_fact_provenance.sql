alter table public.career_facts
  add column language text not null default 'EN',
  add column category text not null default 'EXPERIENCE',
  add column source_cv_version_id uuid references public.cv_versions(id) on delete restrict,
  add column source_hash text,
  add column source_locator text,
  add column verification_method text,
  add column verified_at timestamptz;

alter table public.career_facts
  add constraint career_facts_language_check check (language in ('EN','HR')),
  add constraint career_facts_category_check check (category in ('HEADLINE','SUMMARY','EXPERIENCE','SKILL','EDUCATION','CONTACT')),
  add constraint career_facts_source_hash_check check (source_hash is null or source_hash ~ '^[0-9a-f]{64}$'),
  add constraint career_facts_verified_provenance_check check (
    verified=false or (
      source_cv_version_id is not null
      and source_hash is not null
      and source_locator is not null
      and verification_method is not null
      and verified_at is not null
    )
  ) not valid;

update public.career_facts fact
set language='EN',
    category='EXPERIENCE',
    source_cv_version_id=(
      select version.id from public.cv_versions version
      where version.user_id=fact.user_id and version.language='EN' and version.lifecycle='APPROVED'
      order by version.version desc,version.created_at desc limit 1
    ),
    source_hash=(
      select version.content_hash from public.cv_versions version
      where version.user_id=fact.user_id and version.language='EN' and version.lifecycle='APPROVED'
      order by version.version desc,version.created_at desc limit 1
    ),
    source_locator=coalesce(fact.evidence,'English master CV'),
    verification_method='PDF_SHA256_MANUAL_TRANSCRIPTION',
    verified_at=now()
where fact.verified=true and fact.source_cv_version_id is null;

alter table public.career_facts validate constraint career_facts_verified_provenance_check;
create index career_facts_user_language_idx on public.career_facts(user_id,language,category,id) where verified;

revoke all privileges on all tables in schema public from anon;
