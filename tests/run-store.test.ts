import {beforeEach, describe, expect, it} from 'vitest';
import {createRun, getRun, resetHunterRuntime} from '../src/lib/hunter/run-store';
import {getSourceRegistry} from '../src/lib/hunter/registry';

async function terminal(id: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    const run = getRun(id);
    if (run && !['QUEUED', 'RUNNING'].includes(run.status)) return run;
  }
  throw new Error('Run did not reach a terminal state');
}

describe('search run state contract', () => {
  beforeEach(resetHunterRuntime);

  it('returns an immutable queued snapshot and fails closed without configured sources', async () => {
    const response = createRun({registry: getSourceRegistry({})});
    expect(response).toMatchObject({status: 'QUEUED', progress: 0, durability: 'PROCESS_LOCAL'});
    const finished = await terminal(response.id);
    expect(finished).toMatchObject({status: 'FAILED', failureCode: 'NO_RUNNABLE_SOURCES', progress: 100});
    expect(response).toMatchObject({status: 'QUEUED', progress: 0});
  });

  it('deduplicates scheduled triggers by Zagreb local-date key', () => {
    const first = createRun({
      triggerType: 'SCHEDULED',
      idempotencyKey: 'DAILY_HUNT:2026-08-16',
      registry: getSourceRegistry({}),
    });
    const second = createRun({
      triggerType: 'SCHEDULED',
      idempotencyKey: 'DAILY_HUNT:2026-08-16',
      registry: getSourceRegistry({}),
    });
    expect(second.id).toBe(first.id);
  });
});
