import {expect, test, type APIRequestContext} from '@playwright/test';

const terminalStatuses = new Set(['SUCCESS', 'PARTIAL_SUCCESS', 'FAILED', 'AUDIT_FAILED', 'CANCELLED']);

async function pollRun(request: APIRequestContext, id: string) {
  let current: Record<string, unknown> = {};
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await request.get(`/api/search-runs/${id}`);
    expect(response.status()).toBe(200);
    current = await response.json();
    if (terminalStatuses.has(String(current.status))) return current;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Search Run ${id} did not reach a terminal state.`);
}

test('health endpoint proves the app and connected database contract', async ({request}) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
  const body = await response.json();
  expect(body).toMatchObject({
    status: 'HEALTHY',
    app: 'Opportunity OS',
    database: {status: 'CONNECTED'},
  });
  expect(body.database.latencyMs).toBeGreaterThanOrEqual(0);
  expect(body.database.tables).toBeGreaterThan(0);
  expect(body.database.sources).toBeGreaterThan(0);
  expect(body.database.principles).toBeGreaterThan(0);
  expect(body.database.conversations).toBeGreaterThan(0);
  expect(Number.isNaN(Date.parse(body.checkedAt))).toBe(false);
});

test('search-run API covers real execution, durable persistence, polling, and missing runs', async ({
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name.includes('mobile'),
    'The real provider API run is exercised once; mobile API contracts are viewport-independent.',
  );
  const created = await request.post('/api/search-runs');
  expect(created.status()).toBe(202);
  expect(created.headers()['content-type']).toContain('application/json');
  const queued = await created.json();
  expect(queued).toMatchObject({status: 'QUEUED', progress: 0, durability: 'PROCESS_LOCAL'});
  expect(queued.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

  const current = await pollRun(request, queued.id);
  expect(current.id).toBe(queued.id);
  expect(current.progress).toBe(100);
  expect(current.durability).toBe('POSTGRES');
  expect(current.sources).toEqual(expect.any(Array));
  expect((current.sources as unknown[]).length).toBeGreaterThan(0);

  const metrics = current.metrics as Record<string, number>;
  for (const name of [
    'sourceCoverage',
    'runnableSources',
    'liveSources',
    'jobsDiscovered',
    'canonicalJobs',
    'freshJobs',
    'eligibleJobs',
    'likelyEligibleJobs',
    'unknownEligibilityJobs',
    'ineligibleJobs',
  ]) {
    expect(metrics[name], name).toBeGreaterThanOrEqual(0);
  }
  expect(metrics.sourceCoverage).toBeLessThanOrEqual(100);
  expect(metrics.liveSources).toBeLessThanOrEqual(metrics.runnableSources);
  expect(metrics.canonicalJobs).toBeLessThanOrEqual(metrics.jobsDiscovered);
  expect(metrics.freshJobs).toBeLessThanOrEqual(metrics.canonicalJobs);

  if (['FAILED', 'AUDIT_FAILED'].includes(String(current.status))) {
    expect(current.failureCode).toEqual(expect.any(String));
  }
  if (['SUCCESS', 'PARTIAL_SUCCESS'].includes(String(current.status))) {
    expect(metrics.liveSources).toBeGreaterThan(0);
  }

  const readback = await request.get(`/api/search-runs/${queued.id}`);
  expect(readback.status()).toBe(200);
  expect(await readback.json()).toMatchObject({id: queued.id, status: current.status, durability: 'POSTGRES'});
  expect((await request.get('/api/search-runs/missing')).status()).toBe(404);
});

test('API routes reject unsupported methods', async ({request}) => {
  expect((await request.get('/api/search-runs')).status()).toBe(405);
  expect((await request.post('/api/health')).status()).toBe(405);
  expect((await request.post('/api/search-runs/missing')).status()).toBe(405);
});

test('scheduled hunter endpoint fails closed without a valid server secret', async ({request}) => {
  const response = await request.post('/api/internal/hunter/scheduled', {
    headers: {'x-opportunity-scheduled-at': new Date().toISOString()},
  });
  expect([401, 503]).toContain(response.status());
  const body = await response.json();
  expect(['UNAUTHORIZED', 'SCHEDULER_NOT_CONFIGURED']).toContain(body.error);
});

test('CV APIs expose metadata and only decrypt approved private PDFs', async ({request}) => {
  const versionsResponse = await request.get('/api/cv-versions');
  expect(versionsResponse.status()).toBe(200);
  expect(versionsResponse.headers()['cache-control']).toContain('private');
  const {versions} = await versionsResponse.json();
  expect(versions).toEqual(expect.any(Array));
  expect(versions.length).toBeGreaterThan(0);
  for (const version of versions) {
    expect(version).toMatchObject({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      language: expect.stringMatching(/^(EN|HR)$/),
      lifecycle: expect.stringMatching(/^(DRAFT|APPROVED|ARCHIVED)$/),
      contentHash: expect.stringMatching(/^[0-9a-f]{64}$/i),
    });
    expect(version).not.toHaveProperty('documentCiphertext');
    expect(version).not.toHaveProperty('documentNonce');
  }

  const approved = new Set(
    versions
      .filter((version: {lifecycle: string}) => version.lifecycle === 'APPROVED')
      .map((version: {language: string}) => version.language),
  );
  expect(approved).toEqual(new Set(['EN', 'HR']));
  for (const [language, slug] of [
    ['EN', 'english'],
    ['HR', 'croatian'],
  ] as const) {
    const response = await request.get(`/api/cv-files/${slug}`);
    if (!approved.has(language)) {
      expect(response.status()).toBe(404);
      continue;
    }
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/pdf');
    expect(response.headers()['cache-control']).toContain('private');
    expect(response.headers().etag).toMatch(/^"sha256-[0-9a-f]{64}"$/i);
    const bytes = await response.body();
    expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  }
  expect((await request.get('/api/cv-files/unknown')).status()).toBe(404);
});
