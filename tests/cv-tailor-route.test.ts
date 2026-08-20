import {describe, expect, it, vi} from 'vitest';
import {handleCvTailorRequest, type CvTailorRouteDependencies} from '../src/app/api/ai/cv-tailor/route';
import {AIConfigurationError, AIGroundingError, AIResponseError} from '../src/lib/ai/errors';
import type {CvTailoringInput} from '../src/lib/ai/schemas';
import type {StoredCareerFact} from '../src/lib/ai/repository';
import type {CvTailoringResult} from '../src/lib/ai/contracts';
import type {StoredJob} from '../src/lib/hunter/engine';

vi.mock('server-only', () => ({}));

const sourceVersionId = '10000000-0000-4000-8000-000000000001';
const sourceHash = 'a'.repeat(64);
const fact = (
  id: string,
  category: StoredCareerFact['category'],
  statement: string,
  language: 'EN' | 'HR' = 'EN',
): StoredCareerFact => ({
  id,
  language,
  category,
  statement,
  evidence: `${language} approved CV · page 1`,
  verified: true,
  sourceCvVersionId: sourceVersionId,
  sourceHash,
  sourceLocator: 'Page 1',
  verificationMethod: 'PDF_SHA256_MANUAL_TRANSCRIPTION',
});

const facts = (): StoredCareerFact[] => [
  fact('20000000-0000-4000-8000-000000000001', 'HEADLINE', 'Source headline'),
  fact('20000000-0000-4000-8000-000000000002', 'SUMMARY', 'Source summary'),
  fact('20000000-0000-4000-8000-000000000003', 'EXPERIENCE', 'Developed C#/.NET backend services.'),
  fact('20000000-0000-4000-8000-000000000004', 'SKILL', 'Source skill'),
  fact('20000000-0000-4000-8000-000000000005', 'CONTACT', 'Private contact'),
  fact('20000000-0000-4000-8000-000000000006', 'EDUCATION', 'Source education'),
];

const job = (overrides: Partial<StoredJob> = {}): StoredJob => ({
  id: '30000000-0000-4000-8000-000000000001',
  sourceId: 'greenhouse-board',
  externalId: 'job-1',
  provider: 'GREENHOUSE',
  title: 'Backend Engineer',
  company: 'Source Company',
  location: 'Remote · Europe',
  url: 'https://boards.example.test/jobs/1',
  description: 'Fully remote role for candidates in Europe. C#/.NET development experience is required.',
  verifiedAt: '2026-08-16T10:00:00.000Z',
  availability: 'LIVE',
  canonicalKey: 'canonical-job-1',
  contentHash: 'b'.repeat(64),
  freshness: 'FRESH',
  eligibility: 'LIKELY_ELIGIBLE',
  eligibilityReason: 'Europe remote; Croatia requires confirmation.',
  eligibilityEvidence: ['Europe remote'],
  expectedValue: null,
  expectedValuePerHour: null,
  scoringStatus: 'INSUFFICIENT_DATA',
  sourceReferences: ['greenhouse-board:job-1'],
  snapshotHashes: ['b'.repeat(64)],
  ...overrides,
});

const successfulResult: CvTailoringResult = {
  draft: {
    headline: {text: 'Source-linked headline', factIds: ['20000000-0000-4000-8000-000000000001']},
    summary: {text: 'Source-linked summary', factIds: ['20000000-0000-4000-8000-000000000002']},
    bulletChanges: [],
    gaps: [],
    warnings: [],
    unsupportedClaims: [],
    reviewRequired: true,
  },
  audit: {
    provider: 'openai-responses',
    useCase: 'CV_TAILOR',
    requestId: 'request-1',
    subjectHash: 'c'.repeat(64),
    responseId: 'response-1',
    modelRequested: 'test-model',
    modelResolved: 'test-model',
    promptVersion: 'test-prompt',
    schemaVersion: 'test-schema',
    promptHash: 'd'.repeat(64),
    inputHash: 'e'.repeat(64),
    outputHash: 'f'.repeat(64),
    generatedAt: '2026-08-16T10:00:00.000Z',
    usage: null,
  },
};

function request(body: unknown) {
  return new Request('http://127.0.0.1/api/ai/cv-tailor', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(body),
  });
}

function dependencies(options: {jobs?: StoredJob[]; careerFacts?: StoredCareerFact[]; error?: Error} = {}) {
  let captured: CvTailoringInput | undefined;
  const tailorCv = vi.fn(async (input: CvTailoringInput) => {
    captured = input;
    if (options.error) throw options.error;
    return successfulResult;
  });
  const recordRun = vi.fn(async () => '40000000-0000-4000-8000-000000000001');
  const deps: CvTailorRouteDependencies = {
    loadJobs: async () => options.jobs ?? [job()],
    loadFacts: async () => options.careerFacts ?? facts(),
    createProvider: () => ({kind: 'openai-responses', tailorCv, generateDailyBrief: vi.fn()}),
    recordRun,
  };
  return {deps, tailorCv, recordRun, captured: () => captured};
}

describe('CV tailoring route real-data boundary', () => {
  it('ignores client-authored claims and builds the provider input from one approved source CV', async () => {
    const fixture = dependencies();
    const response = await handleCvTailorRequest(
      request({
        language: 'en',
        opportunityId: job().id,
        headline: 'INJECTED CLIENT HEADLINE',
        summary: 'INJECTED CLIENT SUMMARY',
      }),
      fixture.deps,
    );
    expect(response.status).toBe(200);
    expect(fixture.captured()?.baseCv).toMatchObject({
      id: sourceVersionId,
      headline: 'Source headline',
      summary: 'Source summary',
    });
    expect(fixture.captured()?.baseCv.bullets.map((item) => item.text)).toEqual([
      'Developed C#/.NET backend services.',
    ]);
    expect(fixture.captured()?.verifiedFacts.map((item) => item.statement)).not.toContain('Private contact');
    expect(fixture.captured()?.verifiedFacts.map((item) => item.statement)).not.toContain('Source education');
    expect(JSON.stringify(fixture.captured())).not.toContain('INJECTED CLIENT');
    expect(fixture.recordRun).toHaveBeenCalledOnce();
  });

  it('requires all source categories and consistent source provenance before calling OpenAI', async () => {
    const missing = dependencies({careerFacts: facts().filter((item) => item.category !== 'SUMMARY')});
    expect((await handleCvTailorRequest(request({language: 'en', opportunityId: job().id}), missing.deps)).status).toBe(
      409,
    );
    expect(missing.tailorCv).not.toHaveBeenCalled();

    const mixedFacts = facts();
    mixedFacts[3] = {...mixedFacts[3]!, sourceHash: '9'.repeat(64)};
    const mixed = dependencies({careerFacts: mixedFacts});
    const mixedResponse = await handleCvTailorRequest(request({language: 'en', opportunityId: job().id}), mixed.deps);
    expect(mixedResponse.status).toBe(409);
    expect(await mixedResponse.json()).toEqual({error: 'INCONSISTENT_CV_PROVENANCE'});
    expect(mixed.tailorCv).not.toHaveBeenCalled();
  });

  it('rejects non-live, ineligible and non-remote opportunities', async () => {
    for (const candidate of [
      job({availability: 'UNKNOWN'}),
      job({eligibility: 'NOT_ELIGIBLE'}),
      job({location: 'Zagreb', description: 'Work from our office.'}),
    ]) {
      const fixture = dependencies({jobs: [candidate]});
      expect(
        (await handleCvTailorRequest(request({language: 'en', opportunityId: candidate.id}), fixture.deps)).status,
      ).toBe(404);
      expect(fixture.tailorCv).not.toHaveBeenCalled();
    }
  });

  it.each([
    [new AIConfigurationError('OPENAI_API_KEY_REQUIRED'), 503, 'OPENAI_DISCONNECTED'],
    [new AIGroundingError('UNKNOWN_FACT'), 422, 'AI_GROUNDING_REJECTED'],
    [new AIResponseError('OPENAI_REQUEST_FAILED'), 502, 'OPENAI_RESPONSE_FAILED'],
  ])('maps %s to a fail-closed response without recording a successful run', async (error, status, code) => {
    const fixture = dependencies({error});
    const response = await handleCvTailorRequest(request({language: 'en', opportunityId: job().id}), fixture.deps);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({error: code});
    expect(fixture.recordRun).not.toHaveBeenCalled();
  });
});
