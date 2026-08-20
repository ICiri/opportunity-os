import fs from 'node:fs';
import {describe, expect, it} from 'vitest';
import {executeHunterRun} from '../src/lib/hunter/orchestrator';
import {getSourceRegistry} from '../src/lib/hunter/registry';

const greenhouseBody = fs.readFileSync('tests/fixtures/hunter/greenhouse-jobs.json', 'utf8');
const leverBody = fs.readFileSync('tests/fixtures/hunter/lever-jobs.json', 'utf8');
const registry = getSourceRegistry({
  HUNTER_GREENHOUSE_SOURCES: JSON.stringify([
    {id: 'northstar-gh', name: 'Northstar', company: 'Northstar Pay', boardToken: 'northstar', markets: ['EU']},
  ]),
  HUNTER_LEVER_SOURCES: JSON.stringify([
    {id: 'atlas-lever', name: 'Atlas', company: 'Atlas Systems', site: 'atlas', region: 'GLOBAL', markets: ['EU']},
  ]),
});

describe('hunter orchestration', () => {
  it('measures only successful official source checks as coverage', async () => {
    const fetchImpl = (async (input: string | URL | Request) =>
      new Response(String(input).includes('greenhouse') ? greenhouseBody : leverBody, {status: 200})) as typeof fetch;
    const result = await executeHunterRun({registry, fetchImpl, now: new Date('2026-08-16T09:00:00Z')});
    expect(result.status).toBe('SUCCESS');
    expect(result.metrics).toMatchObject({
      sourceCoverage: 100,
      liveSources: 2,
      runnableSources: 2,
      jobsDiscovered: 2,
      highFitJobs: 0,
    });
    expect(result.sources.filter((source) => source.status === 'LIVE')).toHaveLength(2);
  });

  it('returns PARTIAL_SUCCESS and zero coverage credit for a failed source', async () => {
    const fetchImpl = (async (input: string | URL | Request) =>
      String(input).includes('greenhouse')
        ? new Response(greenhouseBody, {status: 200})
        : new Response('unavailable', {status: 503})) as typeof fetch;
    const result = await executeHunterRun({registry, fetchImpl, now: new Date('2026-08-16T09:00:00Z')});
    expect(result.status).toBe('PARTIAL_SUCCESS');
    expect(result.metrics).toMatchObject({sourceCoverage: 50, liveSources: 1});
    expect(result.sources.find((source) => source.id === 'atlas-lever')).toMatchObject({
      status: 'DISCONNECTED',
      httpStatus: 503,
    });
  });

  it('fails closed when there are no runnable sources', async () => {
    const result = await executeHunterRun({registry: getSourceRegistry({})});
    expect(result).toMatchObject({status: 'FAILED', failureCode: 'NO_RUNNABLE_SOURCES'});
    expect(result.metrics.sourceCoverage).toBe(0);
  });
});
