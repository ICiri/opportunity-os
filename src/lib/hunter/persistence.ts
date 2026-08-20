import postgres from 'postgres';
import type {HunterExecution, HunterMetrics} from './orchestrator';
import type {HunterSource} from './registry';
import type {SearchRun} from './run-store';
import type {StoredJob} from './engine';
import {availabilityAt, freshness, isVerificationCurrent, normalize, rawJobContentHash} from './engine';

const LOCAL_USER_ID = process.env.OPPORTUNITY_LOCAL_USER_ID ?? '20000000-0000-4000-8000-000000000001';

export function auditHunterExecution(execution: HunterExecution, registry: HunterSource[]) {
  const findings: string[] = [];
  const sourceIds = new Set(registry.map((source) => source.id));
  if (execution.seen !== execution.rawJobs.length) findings.push('RAW_SEEN_COUNT_MISMATCH');
  if (execution.metrics.jobsDiscovered !== execution.rawJobs.length) findings.push('DISCOVERED_COUNT_MISMATCH');
  if (execution.metrics.sourceCoverage < 0 || execution.metrics.sourceCoverage > 100)
    findings.push('INVALID_SOURCE_COVERAGE');
  for (const source of execution.sources) {
    if (!sourceIds.has(source.id)) findings.push(`UNKNOWN_SOURCE:${source.id}`);
    if (
      source.status === 'LIVE' &&
      (!source.checkedAt || !source.httpStatus || source.httpStatus < 200 || source.httpStatus >= 300)
    ) {
      findings.push(`LIVE_SOURCE_WITHOUT_SUCCESS_RESPONSE:${source.id}`);
    }
  }
  for (const raw of execution.rawJobs) {
    if (!sourceIds.has(raw.sourceId)) findings.push(`RAW_JOB_UNKNOWN_SOURCE:${raw.sourceId}`);
  }
  for (const job of execution.jobs) {
    if (!URL.canParse(job.url)) findings.push(`INVALID_JOB_URL:${job.id}`);
    if (!job.sourceReferences.length || !job.snapshotHashes.length) findings.push(`JOB_PROVENANCE_MISSING:${job.id}`);
  }
  if (execution.status === 'SUCCESS' && execution.metrics.liveSources === 0)
    findings.push('SUCCESS_WITHOUT_LIVE_SOURCE');
  return [...new Set(findings)];
}

function databaseUrl(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.NODE_ENV !== 'production') return 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
  return null;
}

export async function persistHunterExecution(run: SearchRun, execution: HunterExecution, registry: HunterSource[]) {
  const auditFindings = auditHunterExecution(execution, registry);
  if (auditFindings.length) throw new Error(`HUNTER_EXECUTION_AUDIT_FAILED:${auditFindings.join(',')}`);
  const url = databaseUrl();
  if (!url) throw new Error('Hunter persistence database is unavailable.');
  const sql = postgres(url, {max: 1, prepare: false});
  try {
    await sql.begin(async (tx) => {
      const sourceIds = new Map<string, string>();
      for (const source of registry) {
        const outcome = execution.sources.find((item) => item.id === source.id);
        const status = outcome?.status ?? source.status;
        const rows = await tx<{id: string}[]>`
          insert into public.sources(
            name,country,base_url,type,priority,enabled,adapter_name,capabilities,
            terms_checked,robots_checked,last_run_at,last_success_at,health_score,
            registry_status,coverage_regions,verified_at,last_http_status,status_note
          ) values(
            ${source.name},'MULTI',${source.endpoint ?? null},${source.provider ? 'ATS' : 'SEARCH'},
            ${source.access === 'OFFICIAL_PUBLIC_API' ? 'A' : 'C'},${source.configured},
            ${source.provider?.toLowerCase() ?? null},${tx.json({published_jobs: Boolean(source.provider), applications: false})},
            false,false,
            ${outcome?.checkedAt ?? null},${status === 'LIVE' ? (outcome?.checkedAt ?? null) : null},
            ${status === 'LIVE' && outcome?.httpStatus && outcome.httpStatus >= 200 && outcome.httpStatus < 300 ? 100 : 0},${status},${source.markets},
            ${outcome?.checkedAt ?? null},${outcome?.httpStatus ?? null},${outcome?.error ?? source.note}
          ) on conflict(name,country) do update set
            base_url=excluded.base_url,enabled=excluded.enabled,adapter_name=excluded.adapter_name,
            capabilities=excluded.capabilities,last_run_at=excluded.last_run_at,
            last_success_at=coalesce(excluded.last_success_at,public.sources.last_success_at),
            health_score=excluded.health_score,registry_status=excluded.registry_status,
            coverage_regions=excluded.coverage_regions,verified_at=excluded.verified_at,
            last_http_status=excluded.last_http_status,status_note=excluded.status_note
          returning id
        `;
        if (rows[0]) sourceIds.set(source.id, rows[0].id);
      }

      await tx`
        insert into public.search_runs(
          id,user_id,trigger_type,status,started_at,finished_at,items_seen,items_new,
          items_updated,errors_count,audit_status,created_at,scheduled_local_date,idempotency_key
        ) values(
          ${run.id},${LOCAL_USER_ID},${run.triggerType},${execution.status},${run.createdAt},now(),
          ${execution.seen},${execution.created},${execution.updated},
          ${execution.sources.filter((source) => source.status === 'DISCONNECTED').length},'PASS',${run.createdAt},
          ${run.triggerType === 'SCHEDULED' ? run.createdAt.slice(0, 10) : null},${run.idempotencyKey ?? null}
        ) on conflict(id) do update set
          status=excluded.status,finished_at=excluded.finished_at,items_seen=excluded.items_seen,
          items_new=excluded.items_new,items_updated=excluded.items_updated,
          errors_count=excluded.errors_count,audit_status=excluded.audit_status
      `;

      for (const source of execution.sources) {
        const sourceId = sourceIds.get(source.id);
        if (!sourceId) continue;
        await tx`
          insert into public.search_run_sources(search_run_id,source_id,status,items_seen,error)
          values(${run.id},${sourceId},${source.status},${source.itemsSeen},${source.error ?? null})
          on conflict(search_run_id,source_id) do update set
            status=excluded.status,items_seen=excluded.items_seen,error=excluded.error
        `;
        await tx`
          insert into public.source_statistics(source_id,day,items_seen,items_new,failures,latency_ms)
          values(${sourceId},${run.createdAt.slice(0, 10)},${source.itemsSeen},0,${source.status === 'LIVE' ? 0 : 1},null)
          on conflict(source_id,day) do update set
            items_seen=excluded.items_seen,failures=excluded.failures
        `;
      }

      for (const raw of execution.rawJobs) {
        const sourceId = sourceIds.get(raw.sourceId);
        if (!sourceId) continue;
        await tx`
          insert into public.raw_ingest(
            source_id,search_run_id,external_id,retrieved_at,raw_payload,content_hash,processing_status
          ) values(
            ${sourceId},${run.id},${raw.externalId},now(),
            ${tx.json({title: raw.title, company: raw.company, location: raw.location, url: raw.url, publishedAt: raw.publishedAt, sourceUpdatedAt: raw.sourceUpdatedAt})},
            ${rawJobContentHash(raw)},'PROCESSED'
          ) on conflict(source_id,external_id,content_hash) do nothing
        `;
      }

      for (const job of execution.jobs) {
        const sourceId = sourceIds.get(job.sourceId);
        if (!sourceId) continue;
        const companies = await tx<{id: string}[]>`
          insert into public.companies(user_id,name,canonical_name,country,relationship_score)
          values(${LOCAL_USER_ID},${job.company},${normalize(job.company).replaceAll(' ', '-')},null,0)
          on conflict(user_id,canonical_name) do update set name=excluded.name
          returning id
        `;
        const company = companies[0];
        if (!company) continue;
        const postings = await tx<{id: string}[]>`
          insert into public.job_postings(
            user_id,company_id,title,canonical_key,location,country,freshness,eligibility,
            content_hash,first_seen_at,last_verified_at,availability_status,eligibility_reason,
            eligibility_evidence,published_at,source_updated_at,scoring_status
          ) values(
            ${LOCAL_USER_ID},${company.id},${job.title},${job.canonicalKey},${job.location},null,
            ${job.freshness},${job.eligibility},${job.contentHash},now(),${job.verifiedAt ?? run.createdAt},
            ${job.availability},${job.eligibilityReason},${tx.json(job.eligibilityEvidence)},
            ${job.publishedAt ?? null},${job.sourceUpdatedAt ?? null},${job.scoringStatus}
          ) on conflict(user_id,canonical_key) do update set
            title=excluded.title,location=excluded.location,freshness=excluded.freshness,
            eligibility=excluded.eligibility,content_hash=excluded.content_hash,
            last_verified_at=excluded.last_verified_at,availability_status=excluded.availability_status,
            eligibility_reason=excluded.eligibility_reason,eligibility_evidence=excluded.eligibility_evidence,
            published_at=excluded.published_at,source_updated_at=excluded.source_updated_at,
            scoring_status=excluded.scoring_status
          returning id
        `;
        const posting = postings[0];
        if (!posting) continue;
        const sourceOutcome = execution.sources.find((source) => source.id === job.sourceId);
        await tx`
          insert into public.job_sources(
            job_posting_id,source_id,external_id,source_url,last_verified_at,verification_status,http_status,last_search_run_id
          ) values(
            ${posting.id},${sourceId},${job.externalId},${job.url},${job.verifiedAt ?? run.createdAt},
            'FEED_PRESENT',${sourceOutcome?.httpStatus ?? null},${run.id}
          )
          on conflict(job_posting_id,source_id,external_id) do update set
            source_url=excluded.source_url,last_verified_at=excluded.last_verified_at,
            verification_status=excluded.verification_status,http_status=excluded.http_status,
            last_search_run_id=excluded.last_search_run_id
        `;
        await tx`
          insert into public.job_snapshots(
            job_posting_id,title,description,requirements,location,remote_policy,
            application_url,source_url,content_hash
          ) values(
            ${posting.id},${job.title},${job.description},'[]'::jsonb,${job.location},null,
            ${job.url},${job.url},${job.contentHash}
          ) on conflict(job_posting_id,content_hash) do nothing
        `;
      }

      const metrics = execution.metrics;
      await tx`
        insert into public.hunt_run_metrics(
          user_id,search_run_id,source_coverage,live_sources,countries_covered,jobs_discovered,
          fresh_jobs,eligible_jobs,high_fit_jobs,bounty_programs_discovered,canonical_jobs,
          likely_eligible_jobs,unknown_eligibility_jobs,ineligible_jobs,economically_scored_jobs
        ) values(
          ${LOCAL_USER_ID},${run.id},${metrics.sourceCoverage},${metrics.liveSources},${metrics.countriesCovered},
          ${metrics.jobsDiscovered},${metrics.freshJobs},${metrics.eligibleJobs},${metrics.highFitJobs},0,
          ${metrics.canonicalJobs},${metrics.likelyEligibleJobs},${metrics.unknownEligibilityJobs},
          ${metrics.ineligibleJobs},${metrics.economicallyScoredJobs}
        ) on conflict(search_run_id) do update set
          source_coverage=excluded.source_coverage,live_sources=excluded.live_sources,
          countries_covered=excluded.countries_covered,jobs_discovered=excluded.jobs_discovered,
          fresh_jobs=excluded.fresh_jobs,eligible_jobs=excluded.eligible_jobs,
          high_fit_jobs=excluded.high_fit_jobs,canonical_jobs=excluded.canonical_jobs,
          likely_eligible_jobs=excluded.likely_eligible_jobs,
          unknown_eligibility_jobs=excluded.unknown_eligibility_jobs,
          ineligible_jobs=excluded.ineligible_jobs,
          economically_scored_jobs=excluded.economically_scored_jobs
      `;
    });
  } finally {
    await sql.end();
  }
}

export async function loadPersistedHunterJobs(limit = 100, now = new Date()): Promise<StoredJob[]> {
  const url = databaseUrl();
  if (!url) return [];
  const sql = postgres(url, {max: 1, prepare: false});
  try {
    const rows = await sql<Record<string, unknown>[]>`
      select posting.id,posting.title,posting.canonical_key,posting.location,posting.freshness,
        posting.eligibility,posting.eligibility_reason,posting.eligibility_evidence,
        posting.content_hash,posting.first_seen_at,posting.last_verified_at,
        posting.availability_status,posting.published_at,posting.source_updated_at,
        posting.scoring_status,company.name company,source.id source_uuid,source.adapter_name,
        reference.external_id,reference.source_url,snapshot.description
      from public.job_postings posting
      join public.companies company on company.id=posting.company_id
      join lateral (
        select * from public.job_sources item where item.job_posting_id=posting.id
          and item.verification_status='FEED_PRESENT'
          and exists(
            select 1 from public.search_runs run
            where run.id=item.last_search_run_id and run.user_id=${LOCAL_USER_ID}
              and run.status in ('SUCCESS','PARTIAL_SUCCESS')
              and run.audit_status='PASS' and run.finished_at >= now() - interval '26 hours'
          )
        order by item.last_verified_at desc nulls last limit 1
      ) reference on true
      join public.sources source on source.id=reference.source_id
      left join lateral (
        select description from public.job_snapshots item where item.job_posting_id=posting.id
        order by captured_at desc limit 1
      ) snapshot on true
      where posting.user_id=${LOCAL_USER_ID} and posting.availability_status='LIVE'
      order by posting.last_verified_at desc nulls last
      limit ${Math.max(1, Math.min(limit, 500))}
    `;
    return rows.map((row) => {
      const verifiedAt = row.last_verified_at ? new Date(String(row.last_verified_at)).toISOString() : undefined;
      const publishedAt = row.published_at ? new Date(String(row.published_at)).toISOString() : null;
      const storedAvailability = row.availability_status as StoredJob['availability'];
      const availability = availabilityAt(storedAvailability, verifiedAt, now);
      return {
        id: String(row.id),
        sourceId: String(row.source_uuid),
        externalId: String(row.external_id),
        provider: String(row.adapter_name).includes('lever') ? 'LEVER' : 'GREENHOUSE',
        title: String(row.title),
        company: String(row.company),
        location: String(row.location ?? 'Location not specified'),
        url: String(row.source_url),
        canonicalUrl: String(row.source_url),
        publishedAt,
        sourceUpdatedAt: row.source_updated_at ? new Date(String(row.source_updated_at)).toISOString() : null,
        verifiedAt,
        description: String(row.description ?? ''),
        availability,
        canonicalKey: String(row.canonical_key),
        contentHash: String(row.content_hash),
        freshness: freshness(publishedAt, now, availability),
        eligibility: row.eligibility as StoredJob['eligibility'],
        eligibilityReason: String(row.eligibility_reason ?? ''),
        eligibilityEvidence: Array.isArray(row.eligibility_evidence) ? row.eligibility_evidence.map(String) : [],
        expectedValue: null,
        expectedValuePerHour: null,
        scoringStatus: row.scoring_status as StoredJob['scoringStatus'],
        sourceReferences: [`${String(row.source_uuid)}:${String(row.external_id)}`],
        snapshotHashes: [String(row.content_hash)],
      };
    });
  } finally {
    await sql.end();
  }
}

export async function loadPersistedHunterMetrics(now = new Date()): Promise<HunterMetrics | null> {
  const url = databaseUrl();
  if (!url) return null;
  const sql = postgres(url, {max: 1, prepare: false});
  try {
    const rows = await sql<Record<string, unknown>[]>`
      select metric.source_coverage,metric.live_sources,metric.countries_covered,
        metric.jobs_discovered,metric.canonical_jobs,metric.fresh_jobs,metric.eligible_jobs,
        metric.likely_eligible_jobs,metric.unknown_eligibility_jobs,metric.ineligible_jobs,
        metric.high_fit_jobs,metric.economically_scored_jobs,metric.captured_at,run.finished_at,
        (select count(*)::int from public.search_run_sources item where item.search_run_id=metric.search_run_id) registered_sources,
        (select count(*)::int from public.search_run_sources item where item.search_run_id=metric.search_run_id and item.status<>'RESEARCH') runnable_sources
      from public.hunt_run_metrics metric
      join public.search_runs run on run.id=metric.search_run_id
      where metric.user_id=${LOCAL_USER_ID} and run.status in ('SUCCESS','PARTIAL_SUCCESS')
        and run.audit_status='PASS'
      order by metric.captured_at desc limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    const sourceCheckCurrent = isVerificationCurrent(
      row.finished_at ? new Date(String(row.finished_at)) : new Date(String(row.captured_at)),
      now,
    );
    const numeric = (value: unknown) => Number(value ?? 0);
    return {
      sourceCoverage: sourceCheckCurrent ? numeric(row.source_coverage) : 0,
      registeredSources: numeric(row.registered_sources),
      runnableSources: numeric(row.runnable_sources),
      liveSources: sourceCheckCurrent ? numeric(row.live_sources) : 0,
      countriesCovered: sourceCheckCurrent ? numeric(row.countries_covered) : 0,
      jobsDiscovered: numeric(row.jobs_discovered),
      canonicalJobs: numeric(row.canonical_jobs),
      freshJobs: sourceCheckCurrent ? numeric(row.fresh_jobs) : 0,
      eligibleJobs: sourceCheckCurrent ? numeric(row.eligible_jobs) : 0,
      likelyEligibleJobs: sourceCheckCurrent ? numeric(row.likely_eligible_jobs) : 0,
      unknownEligibilityJobs: sourceCheckCurrent ? numeric(row.unknown_eligibility_jobs) : 0,
      ineligibleJobs: sourceCheckCurrent ? numeric(row.ineligible_jobs) : 0,
      highFitJobs: sourceCheckCurrent ? numeric(row.high_fit_jobs) : 0,
      economicallyScoredJobs: sourceCheckCurrent ? numeric(row.economically_scored_jobs) : 0,
    };
  } finally {
    await sql.end();
  }
}

export async function findPersistedScheduledRun(idempotencyKey: string) {
  const url = databaseUrl();
  if (!url) return null;
  const sql = postgres(url, {max: 1, prepare: false});
  try {
    const rows = await sql<{id: string; status: SearchRun['status']; created_at: Date; finished_at: Date | null}[]>`
      select id,status,created_at,finished_at from public.search_runs
      where user_id=${LOCAL_USER_ID} and idempotency_key=${idempotencyKey}
      limit 1
    `;
    const row = rows[0];
    return row
      ? {
          id: row.id,
          status: row.status,
          createdAt: row.created_at.toISOString(),
          finishedAt: row.finished_at?.toISOString(),
          durability: 'POSTGRES' as const,
        }
      : null;
  } finally {
    await sql.end();
  }
}
