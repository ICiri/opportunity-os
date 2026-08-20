import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {POST} from '../src/app/api/internal/hunter/scheduled/route';
import {resetHunterRuntime} from '../src/lib/hunter/run-store';

const secret = 'a-secure-scheduler-secret-that-is-long-enough';
const request = (instant: string, authorization = `Bearer ${secret}`) =>
  new Request('http://localhost/api/internal/hunter/scheduled', {
    method: 'POST',
    headers: {authorization, 'x-opportunity-scheduled-at': instant},
  });

describe('scheduled hunter route', () => {
  beforeEach(() => {
    resetHunterRuntime();
    process.env.HUNTER_CRON_SECRET = secret;
    process.env.OPPORTUNITY_OS_TEST_MODE = '1';
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.HUNTER_CRON_SECRET;
    delete process.env.OPPORTUNITY_OS_TEST_MODE;
  });

  it('rejects an invalid secret', async () => {
    const response = await POST(request(new Date().toISOString(), 'Bearer invalid'));
    expect(response.status).toBe(401);
  });

  it('skips the non-due UTC candidate and accepts 11:00 Zagreb', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T10:00:00.000Z'));
    const skipped = await POST(request('2026-08-16T10:00:00.000Z'));
    expect(skipped.status).toBe(200);
    expect(await skipped.json()).toMatchObject({status: 'SKIPPED_NOT_DUE', localTime: '12:00:00'});

    vi.setSystemTime(new Date('2026-08-16T09:00:00.000Z'));
    const accepted = await POST(request('2026-08-16T09:00:00.000Z'));
    expect([200, 202]).toContain(accepted.status);
    expect(await accepted.json()).toMatchObject({
      run: {durability: expect.stringMatching(/^(PROCESS_LOCAL|POSTGRES)$/)},
      schedule: {localTime: '11:00:00'},
    });
  });
});
