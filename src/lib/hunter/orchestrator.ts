import {ingest, rankEligibleJobs, type RawJob, type StoredJob} from './engine';
import {fetchSourceJobs, SourceConnectionError} from './adapters';
import type {HunterSource, RegistryStatus} from './registry';

export type HunterMetrics = {
  sourceCoverage: number;
  registeredSources: number;
  runnableSources: number;
  liveSources: number;
  countriesCovered: number;
  jobsDiscovered: number;
  canonicalJobs: number;
  freshJobs: number;
  eligibleJobs: number;
  likelyEligibleJobs: number;
  unknownEligibilityJobs: number;
  ineligibleJobs: number;
  highFitJobs: number;
  economicallyScoredJobs: number;
};

export type SourceExecution = {
  id: string;
  name: string;
  provider?: string;
  markets: string[];
  status: RegistryStatus;
  itemsSeen: number;
  httpStatus?: number;
  checkedAt?: string;
  error?: string;
};

export type HunterExecution = {
  status: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED';
  failureCode?: 'NO_RUNNABLE_SOURCES' | 'ALL_SOURCES_DISCONNECTED';
  sources: SourceExecution[];
  jobs: StoredJob[];
  rawJobs: RawJob[];
  seen: number;
  created: number;
  updated: number;
  duplicates: number;
  metrics: HunterMetrics;
};

export async function executeHunterRun(options: {
  registry: HunterSource[];
  fetchImpl?: typeof fetch;
  now?: Date;
  previousJobs?: StoredJob[];
  timeoutMs?: number;
}): Promise<HunterExecution> {
  const now = options.now ?? new Date();
  const runnable = options.registry.filter(
    (source) => source.configured && ['OFFICIAL_PUBLIC_API', 'LOCAL_DISCOVERY_API'].includes(source.access),
  );
  const research = options.registry
    .filter((source) => !source.configured || source.access === 'RESEARCH_ONLY')
    .map<SourceExecution>((source) => ({
      id: source.id,
      name: source.name,
      provider: source.provider,
      markets: source.markets,
      status: source.status,
      itemsSeen: 0,
      error: source.status === 'DISCONNECTED' ? source.note : undefined,
    }));

  if (runnable.length === 0) {
    return {
      status: 'FAILED',
      failureCode: 'NO_RUNNABLE_SOURCES',
      sources: research,
      jobs: options.previousJobs ?? [],
      rawJobs: [],
      seen: 0,
      created: 0,
      updated: 0,
      duplicates: 0,
      metrics: emptyMetrics(options.registry.length),
    };
  }

  const attempts = await Promise.all(
    runnable.map(async (source) => {
      try {
        const result = await fetchSourceJobs(source, {
          fetchImpl: options.fetchImpl,
          now,
          timeoutMs: options.timeoutMs,
        });
        return {
          source,
          jobs: result.jobs,
          execution: {
            id: source.id,
            name: source.name,
            provider: source.provider,
            markets: source.markets,
            status: 'LIVE' as const,
            itemsSeen: result.jobs.length,
            httpStatus: result.httpStatus,
            checkedAt: result.checkedAt,
          },
        };
      } catch (error) {
        return {
          source,
          jobs: [],
          execution: {
            id: source.id,
            name: source.name,
            provider: source.provider,
            markets: source.markets,
            status: 'DISCONNECTED' as const,
            itemsSeen: 0,
            httpStatus: error instanceof SourceConnectionError ? error.httpStatus : undefined,
            checkedAt: now.toISOString(),
            error: error instanceof Error ? error.message : 'Unknown source failure',
          },
        };
      }
    }),
  );

  const liveAttempts = attempts.filter((attempt) => attempt.execution.status === 'LIVE');
  const rawJobs = liveAttempts.flatMap((attempt) => attempt.jobs);
  const ingestion = ingest(rawJobs, options.previousJobs ?? [], now);
  const currentReferences = new Set(rawJobs.map((job) => `${job.sourceId}:${job.externalId}`));
  const evaluatedCurrentJobs = ingestion.jobs.filter((job) =>
    job.sourceReferences.some((reference) => currentReferences.has(reference)),
  );
  const liveMarkets = new Set(liveAttempts.flatMap((attempt) => attempt.source.markets));
  const metrics: HunterMetrics = {
    sourceCoverage: Math.round((liveAttempts.length / runnable.length) * 100),
    registeredSources: options.registry.length,
    runnableSources: runnable.length,
    liveSources: liveAttempts.length,
    countriesCovered: liveMarkets.size,
    jobsDiscovered: rawJobs.length,
    canonicalJobs: evaluatedCurrentJobs.length,
    freshJobs: evaluatedCurrentJobs.filter(
      (job) => ['NEW', 'FRESH', 'CURRENT'].includes(job.freshness) && job.availability === 'LIVE',
    ).length,
    eligibleJobs: evaluatedCurrentJobs.filter((job) => job.eligibility === 'ELIGIBLE').length,
    likelyEligibleJobs: evaluatedCurrentJobs.filter((job) => job.eligibility === 'LIKELY_ELIGIBLE').length,
    unknownEligibilityJobs: evaluatedCurrentJobs.filter((job) => job.eligibility === 'UNKNOWN').length,
    ineligibleJobs: evaluatedCurrentJobs.filter((job) => job.eligibility === 'NOT_ELIGIBLE').length,
    // Fit is intentionally zero until a versioned evidence-based fit scorer exists.
    highFitJobs: 0,
    economicallyScoredJobs: rankEligibleJobs(evaluatedCurrentJobs).length,
  };
  const status =
    liveAttempts.length === runnable.length ? 'SUCCESS' : liveAttempts.length > 0 ? 'PARTIAL_SUCCESS' : 'FAILED';
  return {
    status,
    failureCode: liveAttempts.length === 0 ? 'ALL_SOURCES_DISCONNECTED' : undefined,
    sources: [...attempts.map((attempt) => attempt.execution), ...research],
    jobs: ingestion.jobs,
    rawJobs,
    seen: ingestion.seen,
    created: ingestion.created,
    updated: ingestion.updated,
    duplicates: ingestion.duplicates,
    metrics,
  };
}

function emptyMetrics(registeredSources: number): HunterMetrics {
  return {
    sourceCoverage: 0,
    registeredSources,
    runnableSources: 0,
    liveSources: 0,
    countriesCovered: 0,
    jobsDiscovered: 0,
    canonicalJobs: 0,
    freshJobs: 0,
    eligibleJobs: 0,
    likelyEligibleJobs: 0,
    unknownEligibilityJobs: 0,
    ineligibleJobs: 0,
    highFitJobs: 0,
    economicallyScoredJobs: 0,
  };
}
