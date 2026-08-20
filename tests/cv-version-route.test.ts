import {describe, expect, it, vi} from 'vitest';
import {handleSaveCvDraftRequest, type CvVersionRouteDependencies} from '../src/app/api/cv-versions/route';
import type {StoredCareerFact} from '../src/lib/ai/repository';
import type {StoredJob} from '../src/lib/hunter/engine';

vi.mock('server-only', () => ({}));

const opportunityId = '30000000-0000-4000-8000-000000000001';
const sourceVersionId = '10000000-0000-4000-8000-000000000001';
const sourceHash = 'a'.repeat(64);
const experienceId = '20000000-0000-4000-8000-000000000001';
const skillId = '20000000-0000-4000-8000-000000000002';

const job = (overrides: Partial<StoredJob> = {}): StoredJob => ({
  id: opportunityId,
  sourceId: 'source',
  externalId: 'external',
  provider: 'GREENHOUSE',
  title: 'Remote Engineer',
  company: 'Company',
  location: 'Remote Europe',
  url: 'https://example.test/job',
  description: 'Fully remote across Europe.',
  availability: 'LIVE',
  canonicalKey: 'key',
  contentHash: 'b'.repeat(64),
  freshness: 'FRESH',
  eligibility: 'LIKELY_ELIGIBLE',
  eligibilityReason: 'Europe remote',
  eligibilityEvidence: ['Europe remote'],
  expectedValue: null,
  expectedValuePerHour: null,
  scoringStatus: 'INSUFFICIENT_DATA',
  sourceReferences: ['source:external'],
  snapshotHashes: ['b'.repeat(64)],
  ...overrides,
});

const fact = (id: string, category: StoredCareerFact['category']): StoredCareerFact => ({
  id,
  category,
  language: 'EN',
  statement: `${category} statement`,
  evidence: 'Approved source CV',
  verified: true,
  sourceCvVersionId: sourceVersionId,
  sourceHash,
  sourceLocator: 'Page 1',
  verificationMethod: 'PDF_SHA256_MANUAL_TRANSCRIPTION',
});
const facts = () => [
  fact(experienceId, 'EXPERIENCE'),
  fact(skillId, 'SKILL'),
  fact('20000000-0000-4000-8000-000000000003', 'HEADLINE'),
];

function request(overrides: Record<string, unknown> = {}) {
  return new Request('http://127.0.0.1/api/cv-versions', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      language: 'EN',
      opportunityId,
      title: 'Reviewed title',
      summary: 'Reviewed summary',
      factDrafts: [
        {sourceFactId: experienceId, category: 'EXPERIENCE', text: 'Edited experience'},
        {sourceFactId: skillId, category: 'SKILL', text: 'Edited skill'},
      ],
      ...overrides,
    }),
  });
}

function dependencies(options: {jobs?: StoredJob[]; careerFacts?: StoredCareerFact[]; saveError?: Error} = {}) {
  const saveDraft = vi.fn(async () => {
    if (options.saveError) throw options.saveError;
    return {
      id: '40000000-0000-4000-8000-000000000001',
      category: 'TAILORED_EN',
      language: 'EN' as const,
      version: 2,
      lifecycle: 'DRAFT' as const,
      contentHash: 'c'.repeat(64),
      createdAt: '2026-08-16T10:00:00.000Z',
    };
  });
  const deps: CvVersionRouteDependencies = {
    loadJobs: async () => options.jobs ?? [job()],
    loadFacts: async () => options.careerFacts ?? facts(),
    saveDraft,
  };
  return {deps, saveDraft};
}

describe('CV version route provenance boundary', () => {
  it('saves only a review-required draft bound to real opportunity and approved source facts', async () => {
    const fixture = dependencies();
    const response = await handleSaveCvDraftRequest(request(), fixture.deps);
    expect(response.status).toBe(201);
    expect(fixture.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        opportunityId,
        sourceCvVersionId: sourceVersionId,
        sourceHash,
        sourceFactIds: [experienceId, skillId],
        reviewRequired: true,
      }),
      expect.any(String),
    );
  });

  it('rejects arbitrary, stale, ineligible and non-remote opportunities', async () => {
    for (const jobs of [
      [],
      [job({availability: 'UNKNOWN'})],
      [job({eligibility: 'NOT_ELIGIBLE'})],
      [job({location: 'Zagreb', description: 'Office based role.'})],
    ]) {
      const fixture = dependencies({jobs});
      expect((await handleSaveCvDraftRequest(request(), fixture.deps)).status).toBe(404);
      expect(fixture.saveDraft).not.toHaveBeenCalled();
    }
  });

  it('rejects unknown fact IDs, wrong categories and mixed source provenance', async () => {
    const unknown = dependencies();
    expect(
      (
        await handleSaveCvDraftRequest(
          request({
            factDrafts: [
              {sourceFactId: '90000000-0000-4000-8000-000000000001', category: 'EXPERIENCE', text: 'Unknown'},
            ],
          }),
          unknown.deps,
        )
      ).status,
    ).toBe(409);
    expect(unknown.saveDraft).not.toHaveBeenCalled();

    const wrongCategory = dependencies();
    expect(
      (
        await handleSaveCvDraftRequest(
          request({factDrafts: [{sourceFactId: experienceId, category: 'SKILL', text: 'Wrong'}]}),
          wrongCategory.deps,
        )
      ).status,
    ).toBe(409);

    const mixedFacts = facts();
    mixedFacts[1] = {...mixedFacts[1]!, sourceCvVersionId: '80000000-0000-4000-8000-000000000001'};
    const mixed = dependencies({careerFacts: mixedFacts});
    const response = await handleSaveCvDraftRequest(request(), mixed.deps);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({error: 'INCONSISTENT_CV_PROVENANCE'});
  });

  it('fails closed if encrypted persistence or AI-run binding fails', async () => {
    const fixture = dependencies({saveError: new Error('binding mismatch')});
    const response = await handleSaveCvDraftRequest(
      request({aiRunId: '70000000-0000-4000-8000-000000000001'}),
      fixture.deps,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({error: 'The encrypted CV draft could not be saved.'});
  });
});
