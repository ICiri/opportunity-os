import postgres from 'postgres';

const REQUIRED_PUBLIC_TABLES = [
  'users',
  'sources',
  'source_checkpoints',
  'search_runs',
  'search_run_sources',
  'hunt_run_metrics',
  'raw_ingest',
  'job_postings',
  'opportunities',
  'email_threads',
  'email_messages',
  'cv_versions',
  'principles',
] as const;

const REQUIRED_PRIVATE_TABLES = [
  'gmail_connections',
  'gmail_message_payloads',
  'gmail_attachments',
  'cv_payloads',
  'ai_payloads',
] as const;

const TABLE_PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] as const;

async function main() {
  const url = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
  const sql = postgres(url, {max: 1});
  const failures: string[] = [];
  const assert = (condition: boolean, code: string) => {
    if (!condition) failures.push(code);
  };

  try {
    const publicTables = await sql<{name: string; rls: boolean}[]>`
      select c.relname as name, c.relrowsecurity as rls
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname
    `;
    const privateTables = await sql<{name: string; rls: boolean}[]>`
      select c.relname as name, c.relrowsecurity as rls
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'private' and c.relkind = 'r'
      order by c.relname
    `;
    const publicNames = new Set(publicTables.map((table) => table.name));
    const privateNames = new Set(privateTables.map((table) => table.name));
    const missingPublic = REQUIRED_PUBLIC_TABLES.filter((table) => !publicNames.has(table));
    const missingPrivate = REQUIRED_PRIVATE_TABLES.filter((table) => !privateNames.has(table));

    assert(missingPublic.length === 0, `PUBLIC_TABLES_MISSING:${missingPublic.join(',')}`);
    assert(missingPrivate.length === 0, `PRIVATE_TABLES_MISSING:${missingPrivate.join(',')}`);
    assert(
      publicTables.every((table) => table.rls),
      `PUBLIC_RLS_DISABLED:${publicTables
        .filter((table) => !table.rls)
        .map((table) => table.name)
        .join(',')}`,
    );
    assert(
      privateTables.every((table) => table.rls),
      `PRIVATE_RLS_DISABLED:${privateTables
        .filter((table) => !table.rls)
        .map((table) => table.name)
        .join(',')}`,
    );

    const anonGrants = await sql<{table_name: string; privilege_type: string}[]>`
      select table_name, privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public' and grantee = 'anon'
    `;
    assert(
      anonGrants.length === 0,
      `ANON_PUBLIC_GRANTS:${anonGrants.map((grant) => `${grant.table_name}:${grant.privilege_type}`).join(',')}`,
    );

    const privateBrowserPrivileges = await sql<{role_name: string; table_name: string; privilege: string}[]>`
      select roles.role_name, tables.tablename as table_name, privileges.privilege
      from (values ('anon'), ('authenticated')) roles(role_name)
      cross join pg_tables tables
      cross join (values ${sql(TABLE_PRIVILEGES.map((privilege) => [privilege]))}) privileges(privilege)
      where tables.schemaname = 'private'
        and has_table_privilege(
          roles.role_name,
          format('%I.%I', tables.schemaname, tables.tablename),
          privileges.privilege
        )
    `;
    assert(
      privateBrowserPrivileges.length === 0,
      `PRIVATE_BROWSER_GRANTS:${privateBrowserPrivileges.map((grant) => `${grant.role_name}:${grant.table_name}:${grant.privilege}`).join(',')}`,
    );

    const privateSchemaPrivileges = await sql<{role_name: string}[]>`
      select role_name
      from (values ('anon'), ('authenticated')) roles(role_name)
      where has_schema_privilege(role_name, 'private', 'USAGE')
         or has_schema_privilege(role_name, 'private', 'CREATE')
    `;
    assert(
      privateSchemaPrivileges.length === 0,
      `PRIVATE_SCHEMA_BROWSER_ACCESS:${privateSchemaPrivileges.map((row) => row.role_name).join(',')}`,
    );

    const serviceRole = await sql<{schema_usage: boolean; payload_select: boolean}[]>`
      select
        has_schema_privilege('service_role', 'private', 'USAGE') as schema_usage,
        has_table_privilege('service_role', 'private.gmail_message_payloads', 'SELECT') as payload_select
    `;
    assert(
      Boolean(serviceRole[0]?.schema_usage && serviceRole[0]?.payload_select),
      'SERVICE_ROLE_PRIVATE_ACCESS_MISSING',
    );

    const sensitiveBrowserPrivileges = await sql<{role_name: string; table_name: string; privilege: string}[]>`
      select roles.role_name, tables.tablename as table_name, privileges.privilege
      from (values ('anon'), ('authenticated')) roles(role_name)
      cross join pg_tables tables
      cross join (values ${sql(TABLE_PRIVILEGES.map((privilege) => [privilege]))}) privileges(privilege)
      where tables.schemaname = 'public'
        and tables.tablename in ('raw_ingest', 'email_messages', 'forecast_points', 'bounty_findings')
        and has_table_privilege(
          roles.role_name,
          format('%I.%I', tables.schemaname, tables.tablename),
          privileges.privilege
        )
    `;
    assert(
      sensitiveBrowserPrivileges.length === 0,
      `SENSITIVE_BROWSER_GRANTS:${sensitiveBrowserPrivileges.map((grant) => `${grant.role_name}:${grant.table_name}:${grant.privilege}`).join(',')}`,
    );

    const registry = await sql<{sources: number; principles: number; synthetic_sources: number}[]>`
      select
        (select count(*)::int from public.sources) as sources,
        (select count(*)::int from public.principles) as principles,
        (select count(*)::int from public.sources where type = 'MOCK') as synthetic_sources
    `;
    assert((registry[0]?.sources ?? 0) > 0, 'SOURCE_REGISTRY_EMPTY');
    assert((registry[0]?.principles ?? 0) > 0, 'PRINCIPLE_REGISTRY_EMPTY');
    assert(registry[0]?.synthetic_sources === 0, `SYNTHETIC_RUNTIME_SOURCES:${registry[0]?.synthetic_sources ?? -1}`);

    const gmail = await sql<
      {
        threads: number;
        messages: number;
        payloads: number;
        public_body_rows: number;
        public_subject_rows: number;
        missing_payloads: number;
        orphan_payloads: number;
        invalid_payloads: number;
      }[]
    >`
      select
        (select count(*)::int from public.email_threads) as threads,
        (select count(*)::int from public.email_messages) as messages,
        (select count(*)::int from private.gmail_message_payloads) as payloads,
        (select count(*)::int from public.email_messages where body_ciphertext is not null) as public_body_rows,
        (select count(*)::int from public.email_threads where subject is not null) as public_subject_rows,
        (
          select count(*)::int
          from public.email_messages message
          left join private.gmail_message_payloads payload
            on payload.message_id = message.id and payload.user_id = message.user_id
          where payload.message_id is null
        ) as missing_payloads,
        (
          select count(*)::int
          from private.gmail_message_payloads payload
          left join public.email_messages message
            on message.id = payload.message_id and message.user_id = payload.user_id
          where message.id is null
        ) as orphan_payloads,
        (
          select count(*)::int
          from private.gmail_message_payloads
          where octet_length(body_nonce) <> 12
             or octet_length(body_ciphertext) <= 16
             or aad_hash is null
             or aad_hash = ''
             or (subject_ciphertext is null) <> (subject_nonce is null)
             or (subject_nonce is not null and octet_length(subject_nonce) <> 12)
        ) as invalid_payloads
    `;
    const gmailState = gmail[0];
    assert((gmailState?.threads ?? 0) > 0, 'GMAIL_THREADS_NOT_IMPORTED');
    assert((gmailState?.messages ?? 0) > 0, 'GMAIL_MESSAGES_NOT_IMPORTED');
    assert(
      gmailState?.payloads === gmailState?.messages,
      `GMAIL_PAYLOAD_PARITY:${gmailState?.payloads ?? -1}/${gmailState?.messages ?? -1}`,
    );
    assert(gmailState?.public_body_rows === 0, `PUBLIC_EMAIL_BODY_ROWS:${gmailState?.public_body_rows ?? -1}`);
    assert(gmailState?.public_subject_rows === 0, `PUBLIC_EMAIL_SUBJECT_ROWS:${gmailState?.public_subject_rows ?? -1}`);
    assert(gmailState?.missing_payloads === 0, `GMAIL_PAYLOADS_MISSING:${gmailState?.missing_payloads ?? -1}`);
    assert(gmailState?.orphan_payloads === 0, `GMAIL_PAYLOAD_ORPHANS:${gmailState?.orphan_payloads ?? -1}`);
    assert(gmailState?.invalid_payloads === 0, `GMAIL_PAYLOAD_CRYPTO_INVALID:${gmailState?.invalid_payloads ?? -1}`);

    const cvs = await sql<
      {
        versions: number;
        payloads: number;
        approved_languages: number;
        missing_payloads: number;
        orphan_payloads: number;
        invalid_payloads: number;
        invalid_approval: number;
        invalid_storage_path: number;
        career_facts: number;
        invalid_fact_provenance: number;
        missing_fact_categories: number;
      }[]
    >`
      select
        (select count(*)::int from public.cv_versions) as versions,
        (select count(*)::int from private.cv_payloads) as payloads,
        (select count(distinct language)::int from public.cv_versions where lifecycle = 'APPROVED') as approved_languages,
        (
          select count(*)::int
          from public.cv_versions version
          left join private.cv_payloads payload
            on payload.cv_version_id = version.id and payload.user_id = version.user_id
          where payload.cv_version_id is null
        ) as missing_payloads,
        (
          select count(*)::int
          from private.cv_payloads payload
          left join public.cv_versions version
            on version.id = payload.cv_version_id and version.user_id = payload.user_id
          where version.id is null
        ) as orphan_payloads,
        (
          select count(*)::int
          from private.cv_payloads
          where octet_length(document_nonce) <> 12
             or octet_length(document_ciphertext) <= 16
             or aad_hash is null
             or aad_hash = ''
        ) as invalid_payloads,
        (select count(*)::int from public.cv_versions where lifecycle = 'APPROVED' and approved_at is null) as invalid_approval,
        (select count(*)::int from public.cv_versions where storage_path is null or storage_path not like 'private.cv_payloads/%') as invalid_storage_path,
        (select count(*)::int from public.career_facts where verified=true) as career_facts,
        (select count(*)::int from public.career_facts fact where fact.verified=true and not exists(
          select 1 from public.cv_versions version where version.id=fact.source_cv_version_id
            and version.user_id=fact.user_id and version.lifecycle='APPROVED'
            and version.language=fact.language and version.content_hash=fact.source_hash
        )) as invalid_fact_provenance,
        (select count(*)::int from (values
          ('EN','HEADLINE'),('EN','SUMMARY'),('EN','EXPERIENCE'),('EN','SKILL'),('EN','CONTACT'),
          ('HR','HEADLINE'),('HR','SUMMARY'),('HR','EXPERIENCE'),('HR','SKILL'),('HR','CONTACT')
        ) required(language,category) where not exists(
          select 1 from public.career_facts fact
          join public.cv_versions version on version.id=fact.source_cv_version_id and version.user_id=fact.user_id
            and version.lifecycle='APPROVED' and version.language=fact.language and version.content_hash=fact.source_hash
          where fact.verified=true and fact.language=required.language and fact.category=required.category
            and fact.source_locator is not null and fact.verification_method is not null
        )) as missing_fact_categories
    `;
    const cvState = cvs[0];
    assert((cvState?.versions ?? 0) > 0, 'CV_VERSIONS_NOT_IMPORTED');
    assert(
      cvState?.payloads === cvState?.versions,
      `CV_PAYLOAD_PARITY:${cvState?.payloads ?? -1}/${cvState?.versions ?? -1}`,
    );
    assert((cvState?.approved_languages ?? 0) >= 2, `CV_APPROVED_LANGUAGES:${cvState?.approved_languages ?? -1}`);
    assert(cvState?.missing_payloads === 0, `CV_PAYLOADS_MISSING:${cvState?.missing_payloads ?? -1}`);
    assert(cvState?.orphan_payloads === 0, `CV_PAYLOAD_ORPHANS:${cvState?.orphan_payloads ?? -1}`);
    assert(cvState?.invalid_payloads === 0, `CV_PAYLOAD_CRYPTO_INVALID:${cvState?.invalid_payloads ?? -1}`);
    assert(cvState?.invalid_approval === 0, `CV_APPROVAL_INVALID:${cvState?.invalid_approval ?? -1}`);
    assert(cvState?.invalid_storage_path === 0, `CV_STORAGE_PATH_INVALID:${cvState?.invalid_storage_path ?? -1}`);
    assert((cvState?.career_facts ?? 0) > 0, 'CAREER_FACTS_MISSING');
    assert(
      cvState?.invalid_fact_provenance === 0,
      `CAREER_FACT_PROVENANCE_INVALID:${cvState?.invalid_fact_provenance ?? -1}`,
    );
    assert(
      cvState?.missing_fact_categories === 0,
      `CAREER_FACT_CATEGORIES_MISSING:${cvState?.missing_fact_categories ?? -1}`,
    );

    const buckets = await sql<{id: string; public: boolean}[]>`
      select id, public from storage.buckets where id in ('cv-private', 'gmail-attachments-private') order by id
    `;
    assert(buckets.length === 2, `PRIVATE_BUCKETS_MISSING:${buckets.map((bucket) => bucket.id).join(',')}`);
    assert(
      buckets.every((bucket) => !bucket.public),
      `PUBLIC_SENSITIVE_BUCKET:${buckets
        .filter((bucket) => bucket.public)
        .map((bucket) => bucket.id)
        .join(',')}`,
    );

    const hunter = await sql<
      {
        runs: number;
        metrics: number;
        completed_without_metrics: number;
        completed_without_sources: number;
        invalid_metrics: number;
        current_audited_runs: number;
        current_feed_jobs: number;
      }[]
    >`
      select
        (select count(*)::int from public.search_runs) as runs,
        (select count(*)::int from public.hunt_run_metrics) as metrics,
        (
          select count(*)::int
          from public.search_runs run
          left join public.hunt_run_metrics metric on metric.search_run_id = run.id
          where run.status in ('SUCCESS', 'PARTIAL_SUCCESS', 'FAILED', 'AUDIT_FAILED')
            and metric.search_run_id is null
        ) as completed_without_metrics,
        (
          select count(*)::int
          from public.search_runs run
          where run.status in ('SUCCESS', 'PARTIAL_SUCCESS', 'FAILED', 'AUDIT_FAILED')
            and not exists (select 1 from public.search_run_sources source where source.search_run_id = run.id)
        ) as completed_without_sources,
        (
          select count(*)::int
          from public.hunt_run_metrics
          where source_coverage < 0 or source_coverage > 100
             or live_sources < 0 or countries_covered < 0 or jobs_discovered < 0
             or fresh_jobs < 0 or eligible_jobs < 0 or likely_eligible_jobs < 0
             or unknown_eligibility_jobs < 0 or ineligible_jobs < 0
             or canonical_jobs > jobs_discovered
             or fresh_jobs > canonical_jobs
        ) as invalid_metrics,
        (select count(*)::int from public.search_runs run
          where run.status in ('SUCCESS','PARTIAL_SUCCESS') and run.audit_status='PASS'
            and run.finished_at >= now() - interval '26 hours') as current_audited_runs,
        (select count(distinct posting.id)::int from public.job_postings posting
          join public.job_sources reference on reference.job_posting_id=posting.id and reference.verification_status='FEED_PRESENT'
          where posting.availability_status='LIVE' and reference.last_verified_at >= now() - interval '26 hours'
            and exists(select 1 from public.search_runs run
              where run.id=reference.last_search_run_id
                and run.status in ('SUCCESS','PARTIAL_SUCCESS') and run.audit_status='PASS'
                and run.finished_at >= now() - interval '26 hours')) as current_feed_jobs
    `;
    const hunterState = hunter[0];
    assert((hunterState?.runs ?? 0) > 0, 'PERSISTED_HUNTER_RUN_MISSING');
    assert((hunterState?.metrics ?? 0) > 0, 'PERSISTED_HUNTER_METRICS_MISSING');
    assert(
      hunterState?.completed_without_metrics === 0,
      `HUNTER_RUNS_WITHOUT_METRICS:${hunterState?.completed_without_metrics ?? -1}`,
    );
    assert(
      hunterState?.completed_without_sources === 0,
      `HUNTER_RUNS_WITHOUT_SOURCE_AUDIT:${hunterState?.completed_without_sources ?? -1}`,
    );
    assert(hunterState?.invalid_metrics === 0, `HUNTER_METRICS_INVALID:${hunterState?.invalid_metrics ?? -1}`);
    assert((hunterState?.current_audited_runs ?? 0) > 0, 'CURRENT_AUDITED_HUNTER_RUN_MISSING');
    assert((hunterState?.current_feed_jobs ?? 0) > 0, 'CURRENT_FEED_JOBS_MISSING');

    const userA = '10000000-0000-4000-8000-000000000001';
    const userB = '10000000-0000-4000-8000-000000000002';
    await sql
      .begin(async (tx) => {
        await tx.unsafe(
          `insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values ('${userA}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rls-a@example.test','',now(),'{}','{}',now(),now()),('${userB}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rls-b@example.test','',now(),'{}','{}',now(),now())`,
        );
        await tx.unsafe(`insert into public.users(id) values ('${userA}'),('${userB}')`);
        await tx.unsafe(
          `insert into public.companies(user_id,name,canonical_name) values ('${userA}','Private A','private-a'),('${userB}','Private B','private-b')`,
        );
        await tx.unsafe('set local role authenticated');
        await tx.unsafe(
          `select set_config('request.jwt.claim.sub','${userA}',true),set_config('request.jwt.claims','{"sub":"${userA}","role":"authenticated"}',true)`,
        );
        const own = await tx<
          {canonical_name: string}[]
        >`select canonical_name from public.companies order by canonical_name`;
        assert(
          own.length === 1 && own[0].canonical_name === 'private-a',
          `RLS_USER_A:${own.map((row) => row.canonical_name).join(',')}`,
        );
        const update =
          await tx`update public.companies set relationship_score = 42 where canonical_name = 'private-a' returning id`;
        assert(update.length === 1, 'RLS_UPDATE_OWN_FAILED');
        const cross =
          await tx`update public.companies set relationship_score = 99 where canonical_name = 'private-b' returning id`;
        assert(cross.length === 0, 'RLS_CROSS_USER_UPDATE');
        await tx.unsafe('reset role');
        throw new Error('__ROLLBACK_TEST__');
      })
      .catch((error) => {
        if (!(error instanceof Error && error.message === '__ROLLBACK_TEST__')) throw error;
      });

    console.log(
      JSON.stringify(
        {
          status: failures.length ? 'FAIL' : 'PASS',
          schema: {
            publicTables: publicTables.length,
            privateTables: privateTables.length,
            rlsEnabled: publicTables.length + privateTables.length,
            anonPublicGrants: anonGrants.length,
            privateBrowserGrants: privateBrowserPrivileges.length,
          },
          gmail: gmailState,
          cvs: cvState,
          hunter: hunterState,
          registry: registry[0],
          crossUserIsolation: !failures.some((failure) => failure.startsWith('RLS_')),
          failures,
        },
        null,
        2,
      ),
    );
    process.exitCode = failures.length ? 1 : 0;
  } finally {
    await sql.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
