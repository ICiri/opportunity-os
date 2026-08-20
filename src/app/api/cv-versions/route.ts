import {z} from 'zod';
import {listCvVersions, saveCvDraft} from '../../../lib/cv/repository';
import {loadVerifiedCareerFacts} from '../../../lib/ai/repository';
import {loadPersistedHunterJobs} from '../../../lib/hunter/persistence';
import {assessRemotePolicy} from '../../../lib/opportunities/view-model';

const LOCAL_USER_ID = process.env.OPPORTUNITY_LOCAL_USER_ID ?? '20000000-0000-4000-8000-000000000001';
const draftSchema = z.object({
  language: z.enum(['EN', 'HR']),
  opportunityId: z.string().trim().min(1).max(128),
  title: z.string().trim().min(1).max(500),
  summary: z.string().trim().min(1).max(4_000),
  factDrafts: z
    .array(
      z.object({
        sourceFactId: z.string().uuid(),
        category: z.enum(['EXPERIENCE', 'SKILL']),
        text: z.string().trim().min(1).max(2_000),
      }),
    )
    .min(1)
    .max(100),
  aiRunId: z.string().uuid().optional(),
});

export type CvVersionRouteDependencies = {
  loadJobs: typeof loadPersistedHunterJobs;
  loadFacts: typeof loadVerifiedCareerFacts;
  saveDraft: typeof saveCvDraft;
};

const defaultDependencies: CvVersionRouteDependencies = {
  loadJobs: loadPersistedHunterJobs,
  loadFacts: loadVerifiedCareerFacts,
  saveDraft: saveCvDraft,
};

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json(
      {versions: await listCvVersions(LOCAL_USER_ID)},
      {headers: {'Cache-Control': 'private, no-store'}},
    );
  } catch {
    return Response.json({error: 'The private CV store is unavailable.'}, {status: 503});
  }
}

export async function handleSaveCvDraftRequest(
  request: Request,
  dependencies: CvVersionRouteDependencies = defaultDependencies,
) {
  if (process.env.NODE_ENV === 'production' && process.env.OPPORTUNITY_AUTH_MODE !== 'supabase') {
    return Response.json({error: 'Authenticated Supabase mode is required.'}, {status: 503});
  }
  const body = draftSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({error: 'Invalid CV draft.', issues: body.error.issues}, {status: 400});
  try {
    const opportunity = (await dependencies.loadJobs(500)).find((job) => job.id === body.data.opportunityId);
    if (
      !opportunity ||
      opportunity.availability !== 'LIVE' ||
      !['ELIGIBLE', 'LIKELY_ELIGIBLE'].includes(opportunity.eligibility) ||
      assessRemotePolicy(opportunity).policy !== 'REMOTE'
    ) {
      return Response.json({error: 'OPPORTUNITY_NOT_FOUND'}, {status: 404});
    }
    const facts = await dependencies.loadFacts(LOCAL_USER_ID, body.data.language);
    const allowedFactIds = new Set(facts.map((fact) => fact.id));
    const factsById = new Map(facts.map((fact) => [fact.id, fact]));
    if (
      !facts.length ||
      body.data.factDrafts.some((draft) => {
        const sourceFact = factsById.get(draft.sourceFactId);
        return !sourceFact || sourceFact.category !== draft.category;
      })
    ) {
      return Response.json({error: 'SOURCE_LINKED_CAREER_FACTS_REQUIRED'}, {status: 409});
    }
    const source = facts[0];
    if (
      !source ||
      facts.some((fact) => fact.sourceCvVersionId !== source.sourceCvVersionId || fact.sourceHash !== source.sourceHash)
    ) {
      return Response.json({error: 'INCONSISTENT_CV_PROVENANCE'}, {status: 409});
    }
    const version = await dependencies.saveDraft(
      {
        ...body.data,
        sourceCvVersionId: source.sourceCvVersionId,
        sourceHash: source.sourceHash,
        sourceFactIds: [...new Set(body.data.factDrafts.map((draft) => draft.sourceFactId))],
        reviewRequired: true,
      },
      LOCAL_USER_ID,
    );
    return Response.json({version, message: 'Encrypted draft saved. Human review is still required.'}, {status: 201});
  } catch {
    return Response.json({error: 'The encrypted CV draft could not be saved.'}, {status: 503});
  }
}

export async function POST(request: Request) {
  return handleSaveCvDraftRequest(request);
}
