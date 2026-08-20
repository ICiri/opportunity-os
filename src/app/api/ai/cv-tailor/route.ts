import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {loadPersistedHunterJobs} from '../../../../lib/hunter/persistence';
import {AIConfigurationError, AIGroundingError, AIResponseError} from '../../../../lib/ai/errors';
import {loadVerifiedCareerFacts, recordSuccessfulCvAiRun} from '../../../../lib/ai/repository';
import {createOpenAIProvider} from '../../../../lib/ai/server';
import type {CvTailoringInput} from '../../../../lib/ai/schemas';
import {assessRemotePolicy} from '../../../../lib/opportunities/view-model';
import {analyzeRoleFit, selectRoleRelevantFactIds} from '../../../../lib/cv-agent/role-fit';
import {hasRoleFitOverride} from '../../../../lib/cv-agent/repository';

const LOCAL_USER_ID = process.env.OPPORTUNITY_LOCAL_USER_ID ?? '20000000-0000-4000-8000-000000000001';
const requestSchema = z.object({
  language: z.enum(['en', 'hr']),
  opportunityId: z.string().trim().min(1).max(128),
});

export type CvTailorRouteDependencies = {
  loadJobs: typeof loadPersistedHunterJobs;
  loadFacts: typeof loadVerifiedCareerFacts;
  createProvider: typeof createOpenAIProvider;
  recordRun: typeof recordSuccessfulCvAiRun;
};

const defaultDependencies: CvTailorRouteDependencies = {
  loadJobs: loadPersistedHunterJobs,
  loadFacts: loadVerifiedCareerFacts,
  createProvider: createOpenAIProvider,
  recordRun: recordSuccessfulCvAiRun,
};

export async function handleCvTailorRequest(
  request: Request,
  dependencies: CvTailorRouteDependencies = defaultDependencies,
) {
  if (process.env.NODE_ENV === 'production' && process.env.OPPORTUNITY_AUTH_MODE !== 'supabase') {
    return Response.json({error: 'AUTHENTICATED_MODE_REQUIRED'}, {status: 503});
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({error: 'INVALID_CV_TAILOR_REQUEST'}, {status: 400});
  const opportunity = (await dependencies.loadJobs(500)).find((item) => item.id === parsed.data.opportunityId);
  if (
    !opportunity ||
    opportunity.availability !== 'LIVE' ||
    !['ELIGIBLE', 'LIKELY_ELIGIBLE'].includes(opportunity.eligibility) ||
    assessRemotePolicy(opportunity).policy !== 'REMOTE'
  ) {
    return Response.json({error: 'OPPORTUNITY_NOT_FOUND'}, {status: 404});
  }

  try {
    const language = parsed.data.language.toUpperCase() as 'EN' | 'HR';
    const storedFacts = await dependencies.loadFacts(LOCAL_USER_ID, language);
    const source = storedFacts[0];
    if (
      source &&
      storedFacts.some(
        (fact) => fact.sourceCvVersionId !== source.sourceCvVersionId || fact.sourceHash !== source.sourceHash,
      )
    ) {
      return Response.json({error: 'INCONSISTENT_CV_PROVENANCE'}, {status: 409});
    }
    const roleFit = analyzeRoleFit(opportunity.description, storedFacts);
    const passesRoleFit = ['EXCELLENT_MATCH', 'GOOD_MATCH'].includes(roleFit.decision);
    const overridden = passesRoleFit
      ? false
      : await hasRoleFitOverride(LOCAL_USER_ID, opportunity.id, roleFit.analysisHash);
    if (!passesRoleFit && !overridden) {
      return Response.json(
        {error: 'CV_PREPARATION_BLOCKED', decision: roleFit.decision, hardGaps: roleFit.hardGaps},
        {status: 409},
      );
    }
    const headline = storedFacts.find((fact) => fact.category === 'HEADLINE');
    const summary = storedFacts.find((fact) => fact.category === 'SUMMARY');
    const selectedFactIds = selectRoleRelevantFactIds(roleFit);
    const reusableFacts = storedFacts.filter(
      (fact) => selectedFactIds.has(fact.id) && !['CONTACT', 'EDUCATION'].includes(fact.category),
    );
    const sourceBullets = storedFacts.filter(
      (fact) => selectedFactIds.has(fact.id) && ['EXPERIENCE', 'SKILL'].includes(fact.category),
    );
    if (!headline || !summary || !sourceBullets.length || !reusableFacts.length) {
      return Response.json({error: 'SOURCE_LINKED_CAREER_FACTS_REQUIRED'}, {status: 409});
    }
    const evidenceIds = opportunity.sourceReferences.length
      ? opportunity.sourceReferences.map((_, index) => `opportunity-source-${index + 1}`)
      : ['opportunity-source-1'];
    const input: CvTailoringInput = {
      context: {requestId: randomUUID(), subjectId: LOCAL_USER_ID},
      language: parsed.data.language,
      opportunity: {
        id: opportunity.id,
        company: opportunity.company,
        title: opportunity.title,
        description: `${opportunity.location}. ${opportunity.description}`,
        requirements: [opportunity.eligibilityReason, ...opportunity.eligibilityEvidence],
        evidenceIds,
      },
      baseCv: {
        id: headline.sourceCvVersionId,
        headline: headline.statement,
        summary: summary.statement,
        bullets: sourceBullets.map((fact) => ({id: `fact-${fact.id}`, text: fact.statement, factIds: [fact.id]})),
      },
      verifiedFacts: reusableFacts.map(({id, statement, evidence, verified}) => ({id, statement, evidence, verified})),
    };
    const startedAt = performance.now();
    const result = await dependencies.createProvider().tailorCv(input);
    const aiRunId = await dependencies.recordRun(LOCAL_USER_ID, input, result, performance.now() - startedAt);
    return Response.json(
      {draft: result.draft, audit: {...result.audit, requestId: undefined}, aiRunId},
      {headers: {'Cache-Control': 'private, no-store'}},
    );
  } catch (error) {
    if (error instanceof AIConfigurationError) return Response.json({error: 'OPENAI_DISCONNECTED'}, {status: 503});
    if (error instanceof AIGroundingError) return Response.json({error: 'AI_GROUNDING_REJECTED'}, {status: 422});
    if (error instanceof AIResponseError) return Response.json({error: 'OPENAI_RESPONSE_FAILED'}, {status: 502});
    return Response.json({error: 'CV_TAILOR_FAILED'}, {status: 500});
  }
}

export async function POST(request: Request) {
  return handleCvTailorRequest(request);
}
