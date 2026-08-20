import {describe, expect, it} from 'vitest';
import {assessRemotePolicy, reviewableRemoteJobs} from '../src/lib/opportunities/view-model';
import type {StoredJob} from '../src/lib/hunter/engine';

const job = (overrides: Partial<StoredJob> = {}): StoredJob => ({
  id: crypto.randomUUID(),
  sourceId: 'source',
  externalId: crypto.randomUUID(),
  title: 'Engineer',
  company: 'Company',
  location: 'Remote Europe',
  url: 'https://example.test/job',
  description: 'Fully remote role.',
  availability: 'LIVE',
  canonicalKey: crypto.randomUUID(),
  contentHash: 'a'.repeat(64),
  freshness: 'FRESH',
  eligibility: 'LIKELY_ELIGIBLE',
  eligibilityReason: 'Europe remote',
  eligibilityEvidence: ['Europe remote'],
  expectedValue: null,
  expectedValuePerHour: null,
  scoringStatus: 'INSUFFICIENT_DATA',
  sourceReferences: ['source:external'],
  snapshotHashes: ['a'.repeat(64)],
  ...overrides,
});

describe('remote opportunity evidence gate', () => {
  it('classifies explicit remote, hybrid, onsite and unknown wording separately', () => {
    expect(assessRemotePolicy(job()).policy).toBe('REMOTE');
    expect(assessRemotePolicy(job({description: 'Hybrid role with two days in the office.'})).policy).toBe('HYBRID');
    expect(assessRemotePolicy(job({location: 'Zagreb', description: 'Office based role.'})).policy).toBe('ONSITE');
    expect(assessRemotePolicy(job({location: 'Europe', description: 'Build backend services.'})).policy).toBe(
      'UNKNOWN',
    );
  });

  it('never admits onsite Croatia or remote-unknown jobs into the remote-only list', () => {
    const remote = job();
    const onsiteCroatia = job({
      location: 'Zagreb, Croatia',
      description: 'Work from our office.',
      eligibility: 'ELIGIBLE',
    });
    const unknown = job({location: 'Europe', description: 'Build backend services.'});
    expect(reviewableRemoteJobs([onsiteCroatia, unknown, remote]).map((item) => item.id)).toEqual([remote.id]);
  });
});
