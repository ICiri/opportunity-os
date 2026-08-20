import postgres from 'postgres';
import {calculateEconomicScore, eligibility, freshness} from '../src/lib/hunter/engine';
import {getSourceRegistry} from '../src/lib/hunter/registry';
import {forecastAll, scenarios} from '../src/lib/planning/forecast';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
const USER_ID = process.env.OPPORTUNITY_LOCAL_USER_ID ?? '20000000-0000-4000-8000-000000000001';

async function main() {
  const findings: string[] = [];
  let checks = 0;
  const check = (condition: boolean, code: string) => {
    checks += 1;
    if (!condition) findings.push(code);
  };

  check(freshness('2099-01-01T00:00:00.000Z', new Date()) === 'UNKNOWN', 'FUTURE_TIMESTAMP_NOT_REJECTED');
  check(eligibility({location: 'EMEA', description: 'Remote role'}) === 'UNKNOWN', 'EMEA_OVERCLAIMED');
  check(
    eligibility({location: 'Remote', description: 'Worldwide remote'}) === 'LIKELY_ELIGIBLE',
    'WORLDWIDE_REMOTE_OVERCLAIMED',
  );
  const economic = calculateEconomicScore({potentialMax: 2_000, probability: 50, effortHours: 5});
  check(economic.expectedValue === 1_000 && economic.expectedValuePerHour === 200, 'INVALID_ECONOMIC_SCORE');
  const registry = getSourceRegistry();
  check(!registry.some((source) => source.status === 'LIVE' && !source.configured), 'UNVERIFIED_LIVE_SOURCE');
  const forecast = forecastAll(scenarios.base);
  check(
    forecast.length === 7 &&
      forecast.every((point) => point.expectedRecognizedRevenue >= 0 && point.capacityUtilization <= 100),
    'INVALID_FORECAST',
  );

  const sql = postgres(DATABASE_URL, {max: 1, prepare: false, connect_timeout: 3});
  try {
    const [database] = await sql<
      {
        public_tables: number;
        rls_tables: number;
        anon_grants: number;
        private_browser_grants: number;
        messages: number;
        plaintext_messages: number;
        plaintext_subjects: number;
        private_message_payloads: number;
        private_cv_payloads: number;
        approved_cvs: number;
        verified_facts: number;
        invalid_verified_facts: number;
        missing_fact_categories: number;
        vault_keys: number;
        mock_sources: number;
        current_audited_hunts: number;
        current_feed_jobs: number;
      }[]
    >`
      select
        (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r') public_tables,
        (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) rls_tables,
        (select count(*)::int from information_schema.role_table_grants where table_schema='public' and grantee='anon') anon_grants,
        (select count(*)::int from information_schema.role_table_grants where table_schema='private' and grantee in ('anon','authenticated')) private_browser_grants,
        (select count(*)::int from public.email_messages where user_id=${USER_ID}) messages,
        (select count(*)::int from public.email_messages where user_id=${USER_ID} and nullif(body_ciphertext,'') is not null) plaintext_messages,
        (select count(*)::int from public.email_threads where user_id=${USER_ID} and nullif(subject,'') is not null) plaintext_subjects,
        (select count(*)::int from private.gmail_message_payloads where user_id=${USER_ID}) private_message_payloads,
        (select count(*)::int from private.cv_payloads where user_id=${USER_ID}) private_cv_payloads,
        (select count(*)::int from public.cv_versions where user_id=${USER_ID} and lifecycle='APPROVED') approved_cvs,
        (select count(*)::int from public.career_facts fact
          join public.cv_versions version on version.id=fact.source_cv_version_id and version.user_id=fact.user_id
            and version.lifecycle='APPROVED' and version.language=fact.language and version.content_hash=fact.source_hash
          where fact.user_id=${USER_ID} and fact.verified=true and fact.source_locator is not null
            and fact.verification_method is not null) verified_facts,
        (select count(*)::int from public.career_facts fact where fact.user_id=${USER_ID} and fact.verified=true
          and not exists(select 1 from public.cv_versions version where version.id=fact.source_cv_version_id
            and version.user_id=fact.user_id and version.lifecycle='APPROVED'
            and version.language=fact.language and version.content_hash=fact.source_hash)
        ) invalid_verified_facts,
        (select count(*)::int from (values
          ('EN','HEADLINE'),('EN','SUMMARY'),('EN','EXPERIENCE'),('EN','SKILL'),('EN','CONTACT'),
          ('HR','HEADLINE'),('HR','SUMMARY'),('HR','EXPERIENCE'),('HR','SKILL'),('HR','CONTACT')
        ) required(language,category) where not exists(
          select 1 from public.career_facts fact
          join public.cv_versions version on version.id=fact.source_cv_version_id and version.user_id=fact.user_id
            and version.lifecycle='APPROVED' and version.language=fact.language and version.content_hash=fact.source_hash
          where fact.user_id=${USER_ID} and fact.verified=true
            and fact.language=required.language and fact.category=required.category
        )) missing_fact_categories,
        (select count(*)::int from vault.secrets where name='opportunity_data_key_v1') vault_keys,
        (select count(*)::int from public.sources where upper(type)='MOCK' or upper(coalesce(adapter_name,'')) like '%MOCK%') mock_sources,
        (select count(*)::int from public.search_runs where user_id=${USER_ID}
          and status in ('SUCCESS','PARTIAL_SUCCESS') and audit_status='PASS'
          and finished_at >= now() - interval '26 hours') current_audited_hunts,
        (select count(distinct posting.id)::int from public.job_postings posting
          join public.job_sources reference on reference.job_posting_id=posting.id and reference.verification_status='FEED_PRESENT'
          where posting.user_id=${USER_ID} and posting.availability_status='LIVE'
            and reference.last_verified_at >= now() - interval '26 hours'
            and exists(select 1 from public.search_runs run
              where run.id=reference.last_search_run_id and run.user_id=${USER_ID}
                and run.status in ('SUCCESS','PARTIAL_SUCCESS')
                and run.audit_status='PASS' and run.finished_at >= now() - interval '26 hours')) current_feed_jobs
    `;
    check(database.public_tables >= 55, `PUBLIC_TABLE_COUNT:${database.public_tables}`);
    check(database.rls_tables === database.public_tables, `RLS_GAP:${database.rls_tables}/${database.public_tables}`);
    check(database.anon_grants === 0, `ANON_GRANTS:${database.anon_grants}`);
    check(database.private_browser_grants === 0, `PRIVATE_BROWSER_GRANTS:${database.private_browser_grants}`);
    check(database.messages > 0, 'REAL_GMAIL_IMPORT_MISSING');
    check(database.plaintext_messages === 0, `PUBLIC_EMAIL_BODY_PAYLOADS:${database.plaintext_messages}`);
    check(database.plaintext_subjects === 0, `PUBLIC_EMAIL_SUBJECTS:${database.plaintext_subjects}`);
    check(
      database.private_message_payloads === database.messages,
      `PRIVATE_EMAIL_PAYLOAD_MISMATCH:${database.private_message_payloads}/${database.messages}`,
    );
    check(
      database.approved_cvs >= 2 && database.private_cv_payloads >= database.approved_cvs,
      `PRIVATE_CV_MISMATCH:${database.private_cv_payloads}/${database.approved_cvs}`,
    );
    check(database.verified_facts > 0, 'VERIFIED_CAREER_FACTS_MISSING');
    check(database.invalid_verified_facts === 0, `CAREER_FACT_PROVENANCE_INVALID:${database.invalid_verified_facts}`);
    check(database.missing_fact_categories === 0, `CAREER_FACT_CATEGORIES_MISSING:${database.missing_fact_categories}`);
    check(database.vault_keys === 1, `VAULT_KEY_COUNT:${database.vault_keys}`);
    check(database.mock_sources === 0, `MOCK_RUNTIME_SOURCES:${database.mock_sources}`);
    check(
      database.current_audited_hunts > 0 && database.current_feed_jobs > 0,
      `CURRENT_AUDITED_HUNTER_DATA_MISSING:${database.current_audited_hunts}/${database.current_feed_jobs}`,
    );

    console.log(
      JSON.stringify(
        {
          status: findings.length ? 'AUDIT_FAILED' : 'LOCAL_DATA_INTEGRITY_PASS',
          checks,
          runtime: {
            messages: database.messages,
            encryptedMessagePayloads: database.private_message_payloads,
            approvedCvs: database.approved_cvs,
            verifiedCareerFacts: database.verified_facts,
            currentAuditedHunts: database.current_audited_hunts,
            currentFeedJobs: database.current_feed_jobs,
          },
          findings,
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end();
  }
  process.exitCode = findings.length ? 1 : 0;
}

void main().catch((error) => {
  console.error(
    JSON.stringify({status: 'AUDIT_FAILED', error: error instanceof Error ? error.message : 'Unknown audit error'}),
  );
  process.exitCode = 1;
});
