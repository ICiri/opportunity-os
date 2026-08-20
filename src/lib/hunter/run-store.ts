import {randomUUID} from 'node:crypto';
import {selectReviewableJobs, type StoredJob} from './engine';
import {executeHunterRun, type HunterMetrics, type SourceExecution} from './orchestrator';
import {getSourceRegistry, registryMetrics, type HunterSource, type RegistryStatus} from './registry';
import {persistHunterExecution} from './persistence';

export type RunStatus = 'QUEUED' | 'RUNNING' | 'PARTIAL_SUCCESS' | 'SUCCESS' | 'FAILED' | 'AUDIT_FAILED' | 'CANCELLED';
export type SearchRun = {
  id: string;
  triggerType: 'MANUAL' | 'SCHEDULED';
  idempotencyKey?: string;
  status: RunStatus;
  failureCode?: string;
  createdAt: string;
  finishedAt?: string;
  progress: number;
  seen: number;
  created: number;
  updated: number;
  duplicates: number;
  durability: 'PROCESS_LOCAL' | 'POSTGRES';
  metrics: HunterMetrics;
  sources: SourceExecution[];
};

type RuntimeState = {
  runs: Map<string, SearchRun>;
  idempotency: Map<string, string>;
  jobs: StoredJob[];
  sourceHealth: Map<string, {status: RegistryStatus; note: string}>;
  latestRunId?: string;
};

const globalState = globalThis as typeof globalThis & {__opportunityHunterState?: RuntimeState};
const state: RuntimeState = globalState.__opportunityHunterState ?? {
  runs: new Map(),
  idempotency: new Map(),
  jobs: [],
  sourceHealth: new Map(),
};
globalState.__opportunityHunterState = state;

function initialMetrics(registry: HunterSource[]): HunterMetrics {
  const metrics = registryMetrics(registry);
  return {
    ...metrics,
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

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function createRun(
  options: {
    triggerType?: 'MANUAL' | 'SCHEDULED';
    idempotencyKey?: string;
    registry?: HunterSource[];
    fetchImpl?: typeof fetch;
    now?: Date;
    timeoutMs?: number;
  } = {},
) {
  if (options.idempotencyKey) {
    const existingId = state.idempotency.get(options.idempotencyKey);
    const existing = existingId ? state.runs.get(existingId) : undefined;
    if (existing) return clone(existing);
  }
  const registry = options.registry ?? getSourceRegistry();
  const createdAt = (options.now ?? new Date()).toISOString();
  const run: SearchRun = {
    id: randomUUID(),
    triggerType: options.triggerType ?? 'MANUAL',
    idempotencyKey: options.idempotencyKey,
    status: 'QUEUED',
    createdAt,
    progress: 0,
    seen: 0,
    created: 0,
    updated: 0,
    duplicates: 0,
    durability: 'PROCESS_LOCAL',
    metrics: initialMetrics(registry),
    sources: registry.map((source) => ({
      id: source.id,
      name: source.name,
      provider: source.provider,
      markets: source.markets,
      status: source.configured ? 'DISCONNECTED' : source.status,
      itemsSeen: 0,
      error: source.configured ? undefined : source.note,
    })),
  };
  state.runs.set(run.id, run);
  if (options.idempotencyKey) state.idempotency.set(options.idempotencyKey, run.id);
  state.latestRunId = run.id;
  queueMicrotask(() => void execute(run, registry, options));
  return clone(run);
}

async function execute(
  run: SearchRun,
  registry: HunterSource[],
  options: {fetchImpl?: typeof fetch; now?: Date; timeoutMs?: number},
) {
  run.status = 'RUNNING';
  run.progress = 20;
  try {
    const result = await executeHunterRun({
      registry,
      fetchImpl: options.fetchImpl,
      now: options.now,
      timeoutMs: options.timeoutMs,
      previousJobs: state.jobs,
    });
    state.jobs = result.jobs;
    let persisted = false;
    try {
      await persistHunterExecution(run, result, registry);
      persisted = true;
    } catch {
      persisted = false;
    }
    for (const source of result.sources) {
      state.sourceHealth.set(source.id, {
        status: source.status,
        note:
          source.error ?? (source.status === 'LIVE' ? `Last live check: ${source.checkedAt}` : 'No live connection.'),
      });
    }
    Object.assign(run, {
      status: persisted ? result.status : 'AUDIT_FAILED',
      failureCode: persisted ? result.failureCode : 'PERSISTENCE_FAILED',
      progress: 100,
      seen: result.seen,
      created: result.created,
      updated: result.updated,
      duplicates: result.duplicates,
      metrics: result.metrics,
      sources: result.sources,
      durability: persisted ? 'POSTGRES' : 'PROCESS_LOCAL',
      finishedAt: new Date().toISOString(),
    });
  } catch (error) {
    Object.assign(run, {
      status: 'FAILED',
      failureCode: 'HUNTER_RUNTIME_ERROR',
      progress: 100,
      finishedAt: new Date().toISOString(),
    });
    run.sources = run.sources.map((source) => ({
      ...source,
      status: source.status === 'RESEARCH' ? source.status : 'DISCONNECTED',
      error: error instanceof Error ? error.message : 'Unknown hunter failure',
    }));
  }
}

export function getRun(id: string) {
  const run = state.runs.get(id);
  return run ? clone(run) : undefined;
}

export function getRuntimeJob(id: string) {
  const job = state.jobs.find((item) => item.id === id);
  return job ? clone(job) : undefined;
}

export function getHunterOverview() {
  const registry = getSourceRegistry().map((source) => {
    const health = state.sourceHealth.get(source.id);
    return health ? {...source, status: health.status, note: health.note} : source;
  });
  const latestRun = state.latestRunId ? state.runs.get(state.latestRunId) : undefined;
  return {
    registry,
    latestRun: latestRun ? clone(latestRun) : undefined,
    metrics: latestRun?.metrics ?? initialMetrics(registry),
    persistedJobs: state.jobs.length,
    jobs: selectReviewableJobs(clone(state.jobs)),
    durability: latestRun?.durability ?? ('PROCESS_LOCAL' as const),
  };
}

export function resetHunterRuntime() {
  state.runs.clear();
  state.idempotency.clear();
  state.jobs = [];
  state.sourceHealth.clear();
  state.latestRunId = undefined;
}
