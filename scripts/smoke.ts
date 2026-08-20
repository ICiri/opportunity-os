const base = process.env.APP_URL ?? 'http://127.0.0.1:3000';
const routes = [
  '/',
  '/today',
  '/conversations',
  '/opportunities',
  '/hunter',
  '/bounties',
  '/cv-studio',
  '/planning',
  '/relationships',
  '/analytics',
  '/design-audit',
  '/companies/volito-digital/graph',
];
const failures: string[] = [];
const results: {route: string; status: number; bytes: number}[] = [];

type HealthResponse = {
  status: string;
  database?: {
    status: string;
    latencyMs: number;
    tables: number;
    sources: number;
    principles: number;
    conversations: number;
  };
};

type SearchRun = {
  id: string;
  status: string;
  failureCode?: string;
  progress: number;
  seen: number;
  created: number;
  updated: number;
  duplicates: number;
  durability: 'PROCESS_LOCAL' | 'POSTGRES';
  metrics?: {
    sourceCoverage: number;
    runnableSources: number;
    liveSources: number;
    jobsDiscovered: number;
    canonicalJobs: number;
    freshJobs: number;
    eligibleJobs: number;
    likelyEligibleJobs: number;
    unknownEligibilityJobs: number;
    ineligibleJobs: number;
  };
  sources?: unknown[];
};

type CvVersion = {
  id: string;
  language: 'EN' | 'HR';
  lifecycle: 'DRAFT' | 'APPROVED' | 'ARCHIVED';
  contentHash: string;
};

function firstDynamicPath(body: string, prefix: '/conversations/' | '/opportunities/') {
  const escaped = prefix.replaceAll('/', '\\/');
  const match = body.match(new RegExp(`href=["'](${escaped}[^"'?#/]+)["']`, 'i'));
  return match?.[1];
}

function validMetric(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

async function checkRoute(route: string) {
  try {
    const response = await fetch(base + route);
    const body = await response.text();
    results.push({route, status: response.status, bytes: body.length});
    if (!response.ok || body.length < 500) failures.push(`ROUTE:${route}:${response.status}:${body.length}`);
    return body;
  } catch (error) {
    failures.push(`ROUTE:${route}:${error instanceof Error ? error.message : 'ERROR'}`);
    return '';
  }
}

async function pollRun(id: string): Promise<SearchRun | null> {
  const terminal = new Set(['SUCCESS', 'PARTIAL_SUCCESS', 'FAILED', 'AUDIT_FAILED', 'CANCELLED']);
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await fetch(`${base}/api/search-runs/${id}`);
    if (!response.ok) {
      failures.push(`SEARCH_RUN_POLL:${response.status}`);
      return null;
    }
    const run = (await response.json()) as SearchRun;
    if (terminal.has(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  failures.push('SEARCH_RUN_TIMEOUT');
  return null;
}

async function main() {
  const routeBodies = new Map<string, string>();
  for (const route of routes) routeBodies.set(route, await checkRoute(route));

  const conversationPath = firstDynamicPath(routeBodies.get('/conversations') ?? '', '/conversations/');
  if (conversationPath) await checkRoute(conversationPath);
  else failures.push('PERSISTED_CONVERSATION_LINK_MISSING');

  const opportunityPath = firstDynamicPath(routeBodies.get('/opportunities') ?? '', '/opportunities/');
  if (opportunityPath) await checkRoute(opportunityPath);
  else if (
    !/no (?:verified|live|persisted|current)|nothing (?:found|available)|run (?:the )?hunter/i.test(
      routeBodies.get('/opportunities') ?? '',
    )
  ) {
    failures.push('OPPORTUNITY_LIST_NEITHER_DATA_NOR_EMPTY_STATE');
  }

  const health = await fetch(base + '/api/health');
  const healthBody = (await health.json()) as HealthResponse;
  const database = healthBody.database;
  if (
    !health.ok ||
    healthBody.status !== 'HEALTHY' ||
    database?.status !== 'CONNECTED' ||
    !validMetric(database.latencyMs) ||
    (database.tables ?? 0) <= 0 ||
    (database.sources ?? 0) <= 0 ||
    (database.principles ?? 0) <= 0 ||
    (database.conversations ?? 0) <= 0
  )
    failures.push('DATABASE_HEALTH');

  const versionsResponse = await fetch(base + '/api/cv-versions');
  const versionsBody = (await versionsResponse.json()) as {versions?: CvVersion[]};
  const versions = versionsBody.versions ?? [];
  if (!versionsResponse.ok || versions.length === 0) failures.push('CV_VERSIONS_UNAVAILABLE');
  const approvedLanguages = new Set(
    versions.filter((version) => version.lifecycle === 'APPROVED').map((version) => version.language),
  );
  for (const language of approvedLanguages) {
    const slug = language === 'EN' ? 'english' : 'croatian';
    const response = await fetch(`${base}/api/cv-files/${slug}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const signature = new TextDecoder().decode(bytes.slice(0, 5));
    if (!response.ok || !response.headers.get('content-type')?.includes('application/pdf') || signature !== '%PDF-') {
      failures.push(`CV_PDF:${language}:${response.status}`);
    }
  }
  if (!approvedLanguages.has('EN') || !approvedLanguages.has('HR'))
    failures.push(`CV_APPROVED_LANGUAGES:${[...approvedLanguages].join(',')}`);

  const created = await fetch(base + '/api/search-runs', {method: 'POST'});
  const queued = (await created.json()) as SearchRun;
  if (created.status !== 202 || queued.status !== 'QUEUED' || queued.progress !== 0 || !queued.id) {
    failures.push('SEARCH_RUN_CREATE');
  }
  const runBody = queued.id ? await pollRun(queued.id) : null;
  if (runBody) {
    const metrics = runBody.metrics;
    const metricValues = metrics
      ? [
          metrics.sourceCoverage,
          metrics.runnableSources,
          metrics.liveSources,
          metrics.jobsDiscovered,
          metrics.canonicalJobs,
          metrics.freshJobs,
          metrics.eligibleJobs,
          metrics.likelyEligibleJobs,
          metrics.unknownEligibilityJobs,
          metrics.ineligibleJobs,
        ]
      : [];
    if (runBody.progress !== 100) failures.push(`SEARCH_RUN_PROGRESS:${runBody.progress}`);
    if (runBody.durability !== 'POSTGRES') failures.push(`SEARCH_RUN_DURABILITY:${runBody.durability}`);
    if (!metrics || !metricValues.every(validMetric)) failures.push('SEARCH_RUN_METRICS');
    if (
      metrics &&
      (metrics.sourceCoverage > 100 ||
        metrics.liveSources > metrics.runnableSources ||
        metrics.canonicalJobs > metrics.jobsDiscovered ||
        metrics.freshJobs > metrics.canonicalJobs)
    ) {
      failures.push('SEARCH_RUN_METRIC_INVARIANT');
    }
    if (!Array.isArray(runBody.sources) || runBody.sources.length === 0) failures.push('SEARCH_RUN_SOURCE_AUDIT');
    if (['FAILED', 'AUDIT_FAILED'].includes(runBody.status) && !runBody.failureCode)
      failures.push('SEARCH_RUN_FAILURE_WITHOUT_CODE');

    const durableLookup = await fetch(`${base}/api/search-runs/${runBody.id}`);
    const durableBody = (await durableLookup.json()) as SearchRun;
    if (!durableLookup.ok || durableBody.id !== runBody.id || durableBody.status !== runBody.status)
      failures.push('SEARCH_RUN_READBACK');
  }

  console.log(
    JSON.stringify(
      {
        status: failures.length ? 'FAIL' : 'PASS',
        routes: results,
        health: healthBody,
        cvVersions: {count: versions.length, approvedLanguages: [...approvedLanguages]},
        searchNow: runBody,
        failures,
      },
      null,
      2,
    ),
  );
  process.exitCode = failures.length ? 1 : 0;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
