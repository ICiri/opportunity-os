import {describe, expect, it} from 'vitest';
import {
  calculateEconomicScore,
  availabilityAt,
  eligibility,
  freshness,
  ingest,
  isVerificationCurrent,
  selectReviewableJobs,
  type RawJob,
} from '../src/lib/hunter/engine';

const base = (overrides: Partial<RawJob> = {}): RawJob => ({
  sourceId: 'greenhouse-a',
  externalId: 'gh-101',
  requisitionId: 'northstar-payments-2026',
  title: 'Senior Payments Engineer',
  company: 'Northstar Pay',
  location: 'EU Remote',
  url: 'https://boards.greenhouse.io/northstar/jobs/101',
  publishedAt: '2026-08-15T00:00:00.000Z',
  description: 'EU remote; contractor accepted; SEPA and API experience.',
  availability: 'LIVE',
  potentialMax: 18_000,
  probability: 28,
  effortHours: 7,
  currency: 'EUR',
  valueBasis: '90_DAY_GROSS',
  ...overrides,
});

describe('hunter ingestion and evaluation', () => {
  it('collapses only strong cross-source identities and preserves both references', () => {
    const result = ingest([
      base(),
      base({sourceId: 'lever-b', externalId: 'lv-88', url: 'https://jobs.lever.co/northstar/lv-88'}),
    ]);
    expect(result.jobs).toHaveLength(1);
    expect(result.duplicates).toBe(1);
    expect(result.jobs[0].sourceReferences).toEqual(['greenhouse-a:gh-101', 'lever-b:lv-88']);
  });

  it('does not merge distinct requisitions with matching title/company/location', () => {
    const result = ingest([
      base(),
      base({sourceId: 'greenhouse-a', externalId: 'gh-102', requisitionId: 'northstar-payments-2027'}),
    ]);
    expect(result.jobs).toHaveLength(2);
  });

  it('is idempotent and recomputes EV/hour when source evidence changes', () => {
    const first = ingest([base()]);
    const second = ingest(
      [base({potentialMax: 20_000, probability: 50, effortHours: 5, description: 'EU remote updated'})],
      first.jobs,
    );
    expect(second.created).toBe(0);
    expect(second.updated).toBe(1);
    expect(second.jobs[0]).toMatchObject({expectedValue: 10_000, expectedValuePerHour: 2_000});
  });

  it('uses conservative eligibility and future-date handling', () => {
    expect(eligibility({location: 'New York', description: 'United States only'})).toBe('NOT_ELIGIBLE');
    expect(eligibility({location: 'EMEA', description: 'Remote'})).toBe('UNKNOWN');
    expect(freshness('2099-01-01T00:00:00.000Z', new Date('2026-08-16T00:00:00.000Z'))).toBe('UNKNOWN');
    expect(freshness('2026-07-01T00:00:00.000Z', new Date('2026-08-16T00:00:00.000Z'))).toBe('OLD');
    expect(freshness('2026-08-15T00:00:00.000Z', new Date('2026-08-16T00:00:00.000Z'), 'CLOSED')).toBe('EXPIRED');
  });

  it('expires LIVE verification after the daily-run TTL without claiming closure', () => {
    const now = new Date('2026-08-16T12:00:00.000Z');
    expect(isVerificationCurrent('2026-08-15T11:00:00.000Z', now)).toBe(true);
    expect(isVerificationCurrent('2026-08-15T09:59:59.000Z', now)).toBe(false);
    expect(availabilityAt('LIVE', '2026-08-15T09:59:59.000Z', now)).toBe('UNKNOWN');
    expect(availabilityAt('CLOSED', '2026-08-16T11:59:00.000Z', now)).toBe('CLOSED');
  });

  it.each([
    ['Remote within the European Union', 'LIKELY_ELIGIBLE'],
    ['EEA remote', 'LIKELY_ELIGIBLE'],
    ['United States only', 'NOT_ELIGIBLE'],
    ['Canada only', 'NOT_ELIGIBLE'],
    ['UK only', 'NOT_ELIGIBLE'],
    ['Switzerland only', 'NOT_ELIGIBLE'],
    ['Norway only', 'NOT_ELIGIBLE'],
    ['Iceland only', 'NOT_ELIGIBLE'],
    ['Australia only', 'NOT_ELIGIBLE'],
    ['New Zealand only', 'NOT_ELIGIBLE'],
    ['Europe remote B2B contract', 'LIKELY_ELIGIBLE'],
    ['Remote worldwide', 'LIKELY_ELIGIBLE'],
    ['EMEA remote', 'UNKNOWN'],
  ])('classifies Croatia eligibility conservatively for %s', (description, expected) => {
    expect(eligibility({location: 'Remote', description})).toBe(expected);
  });

  it('never fabricates an economic score and rejects invalid assumptions', () => {
    expect(calculateEconomicScore({})).toEqual({
      status: 'INSUFFICIENT_DATA',
      expectedValue: null,
      expectedValuePerHour: null,
    });
    expect(() => calculateEconomicScore({potentialMax: 10_000, probability: 120, effortHours: 5})).toThrow(
      /probability/,
    );
    expect(() => calculateEconomicScore({potentialMax: 10_000, probability: 20, effortHours: 0})).toThrow(
      /effortHours/,
    );
  });

  it('selects reviewable non-closed jobs, ordering current records before stale verification', () => {
    const result = ingest(
      [
        base({
          externalId: 'unknown',
          requisitionId: 'unknown',
          location: 'Remote',
          description: 'Location eligibility is not stated.',
        }),
        base({externalId: 'eligible', requisitionId: 'eligible'}),
        base({externalId: 'stale', requisitionId: 'stale'}),
        base({externalId: 'closed', requisitionId: 'closed', availability: 'CLOSED'}),
        base({
          externalId: 'restricted',
          requisitionId: 'restricted',
          location: 'New York',
          description: 'United States only',
        }),
      ],
      [],
      new Date('2026-08-16T09:00:00.000Z'),
    );
    const stale = result.jobs.find((job) => job.externalId === 'stale');
    if (stale) stale.availability = 'UNKNOWN';
    const selected = selectReviewableJobs(result.jobs);
    expect(selected.map((job) => job.externalId)).toEqual(['eligible', 'unknown', 'stale']);
  });
});
