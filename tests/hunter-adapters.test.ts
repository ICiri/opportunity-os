import fs from 'node:fs';
import {describe, expect, it} from 'vitest';
import {fetchGreenhouseJobs} from '../src/lib/hunter/adapters/greenhouse';
import {fetchLeverJobs} from '../src/lib/hunter/adapters/lever';
import {fetchAshbyJobs} from '../src/lib/hunter/adapters/ashby';
import {fetchJobSpyJobs} from '../src/lib/hunter/adapters/jobspy';
import type {HunterSource} from '../src/lib/hunter/registry';

const fixture = (name: string) => fs.readFileSync(`tests/fixtures/hunter/${name}`, 'utf8');
const response =
  (name: string, status = 200) =>
  async () =>
    new Response(fixture(name), {status, headers: {'content-type': 'application/json'}});

const greenhouse: HunterSource = {
  id: 'northstar-greenhouse',
  name: 'Northstar Greenhouse',
  company: 'Northstar Pay',
  provider: 'GREENHOUSE',
  tenant: 'northstar',
  markets: ['EU'],
  status: 'DISCONNECTED',
  configured: true,
  endpoint: 'https://boards-api.greenhouse.io/v1/boards/northstar/jobs?content=true',
  note: 'Configured',
  access: 'OFFICIAL_PUBLIC_API',
};
const lever: HunterSource = {
  id: 'atlas-lever',
  name: 'Atlas Lever',
  company: 'Atlas Systems',
  provider: 'LEVER',
  tenant: 'atlas',
  leverRegion: 'GLOBAL',
  markets: ['EU'],
  status: 'DISCONNECTED',
  configured: true,
  endpoint: 'https://api.lever.co/v0/postings/atlas?mode=json',
  note: 'Configured',
  access: 'OFFICIAL_PUBLIC_API',
};
const ashby: HunterSource = {
  id: 'example-ashby',
  name: 'Example Ashby',
  company: 'Example',
  provider: 'ASHBY',
  tenant: 'example',
  markets: ['EU'],
  status: 'DISCONNECTED',
  configured: true,
  endpoint: 'https://api.ashbyhq.com/posting-api/job-board/example?includeCompensation=true',
  note: 'Configured',
  access: 'OFFICIAL_PUBLIC_API',
};
const jobSpy: HunterSource = {
  id: 'jobspy-contracts',
  name: 'JobSpy contracts',
  provider: 'JOBSPY',
  markets: ['EU', 'UK'],
  status: 'DISCONNECTED',
  configured: true,
  endpoint: 'http://127.0.0.1:8001/api/v1/search_jobs?site_name=indeed',
  note: 'Configured',
  access: 'LOCAL_DISCOVERY_API',
};

describe('official provider adapters', () => {
  it('normalizes published Greenhouse jobs and excludes prospect posts', async () => {
    const result = await fetchGreenhouseJobs(greenhouse, {
      fetchImpl: response('greenhouse-jobs.json') as typeof fetch,
      now: new Date('2026-08-16T09:00:00Z'),
    });
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      externalId: '501',
      requisitionId: '9001',
      availability: 'LIVE',
      publishedAt: null,
    });
    expect(result.jobs[0].description).toContain('Remote within the EU');
  });

  it('normalizes Lever jobs without inventing compensation or eligibility', async () => {
    const result = await fetchLeverJobs(lever, {
      fetchImpl: response('lever-jobs.json') as typeof fetch,
      now: new Date('2026-08-16T09:00:00Z'),
    });
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({externalId: 'lever-701', availability: 'LIVE'});
    expect(result.jobs[0].potentialMax).toBeUndefined();
    expect(result.jobs[0].description).toContain('B2B');
  });

  it('normalizes jobs from the official Ashby posting API', async () => {
    const result = await fetchAshbyJobs(ashby, {
      fetchImpl: response('ashby-jobs.json') as typeof fetch,
      now: new Date('2026-08-20T09:00:00Z'),
    });
    expect(result.jobs[0]).toMatchObject({
      provider: 'ASHBY',
      externalId: 'ashby-801',
      location: 'Remote — Europe',
      availability: 'LIVE',
    });
    expect(result.jobs[0].description).toContain('B2B contract');
  });

  it('normalizes contract discovery from a loopback-only JobSpy service', async () => {
    const payload = JSON.stringify({
      jobs: [
        {
          id: 'indeed-901',
          site: 'indeed',
          job_url: 'https://example.com/jobs/901',
          title: 'Senior .NET Contractor',
          company: 'Example Consulting',
          location: 'Remote - Europe',
          description: 'Remote B2B contract for 20 hours per week.',
          date_posted: '2026-08-31',
          job_type: 'contract',
        },
      ],
    });
    const result = await fetchJobSpyJobs(jobSpy, {
      fetchImpl: (async () => new Response(payload, {status: 200})) as typeof fetch,
      now: new Date('2026-09-01T08:00:00Z'),
    });
    expect(result.jobs[0]).toMatchObject({
      provider: 'JOBSPY',
      externalId: 'indeed-901',
      company: 'Example Consulting',
      availability: 'LIVE',
    });
  });

  it('refuses a non-loopback JobSpy endpoint', async () => {
    await expect(fetchJobSpyJobs({...jobSpy, endpoint: 'https://example.com/jobs'})).rejects.toMatchObject({
      code: 'INVALID_CONFIGURATION',
    });
  });

  it('fails the source closed on non-2xx responses', async () => {
    await expect(
      fetchGreenhouseJobs(greenhouse, {fetchImpl: response('greenhouse-jobs.json', 503) as typeof fetch}),
    ).rejects.toMatchObject({code: 'HTTP_ERROR', httpStatus: 503});
  });

  it('aborts a provider that exceeds its timeout budget', async () => {
    const stalled = ((_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })) as typeof fetch;
    await expect(fetchGreenhouseJobs(greenhouse, {fetchImpl: stalled, timeoutMs: 2})).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });
});
