import {describe, expect, it} from 'vitest';
import {CLOUDFLARE_CRON_CANDIDATES, zagrebScheduleDecision} from '../src/lib/hunter/schedule';

describe('11:00 Europe/Zagreb schedule', () => {
  it.each([
    ['summer due', '2026-08-16T09:00:00.000Z', true, '11:00:00'],
    ['summer second UTC candidate', '2026-08-16T10:00:00.000Z', false, '12:00:00'],
    ['winter first UTC candidate', '2026-12-16T09:00:00.000Z', false, '10:00:00'],
    ['winter due', '2026-12-16T10:00:00.000Z', true, '11:00:00'],
  ])('%s', (_, instant, due, localTime) => {
    expect(zagrebScheduleDecision(new Date(instant))).toMatchObject({due, localTime, timezone: 'Europe/Zagreb'});
  });

  it('uses the two UTC candidates required across CET and CEST', () => {
    expect(CLOUDFLARE_CRON_CANDIDATES).toEqual(['0 9 * * *', '0 10 * * *']);
  });

  it('does not treat the rest of the 11:00 hour as the 11:00 trigger', () => {
    expect(zagrebScheduleDecision(new Date('2026-08-16T09:30:00.000Z')).due).toBe(false);
  });
});
