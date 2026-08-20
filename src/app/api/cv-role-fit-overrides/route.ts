import {z} from 'zod';
import {analyzeRoleFit} from '@/lib/cv-agent/role-fit';
import {createRoleFitOverride} from '@/lib/cv-agent/repository';
import {loadVerifiedCareerFacts} from '@/lib/ai/repository';
import {loadPersistedHunterJobs} from '@/lib/hunter/persistence';

const LOCAL_USER_ID = process.env.OPPORTUNITY_LOCAL_USER_ID ?? '20000000-0000-4000-8000-000000000001';
const schema = z.object({
  jobPostingId: z.string().uuid(),
  analysisHash: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().min(12).max(2000),
  acknowledgedGaps: z.array(z.string().min(1)).min(1),
});

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production' && process.env.OPPORTUNITY_AUTH_MODE !== 'supabase')
    return Response.json({error: 'AUTHENTICATED_MODE_REQUIRED'}, {status: 503});
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({error: 'INVALID_ROLE_FIT_OVERRIDE'}, {status: 400});
  const [job, facts] = await Promise.all([
    loadPersistedHunterJobs(500).then((jobs) => jobs.find((item) => item.id === parsed.data.jobPostingId)),
    loadVerifiedCareerFacts(LOCAL_USER_ID, 'EN'),
  ]);
  if (!job) return Response.json({error: 'OPPORTUNITY_NOT_FOUND'}, {status: 404});
  const analysis = analyzeRoleFit(job.description, facts);
  if (analysis.analysisHash !== parsed.data.analysisHash)
    return Response.json({error: 'STALE_ROLE_FIT_ANALYSIS'}, {status: 409});
  if (!['BORDERLINE', 'BLOCKED_HARD_GAP'].includes(analysis.decision))
    return Response.json({error: 'ROLE_FIT_OVERRIDE_NOT_ALLOWED'}, {status: 409});
  const result = await createRoleFitOverride({
    userId: LOCAL_USER_ID,
    jobPostingId: job.id,
    analysisHash: analysis.analysisHash,
    decision: analysis.decision as 'BORDERLINE' | 'BLOCKED_HARD_GAP',
    reason: parsed.data.reason,
    acknowledgedGaps: parsed.data.acknowledgedGaps,
  });
  return Response.json(
    {created: Boolean(result), override: result},
    {status: result ? 201 : 200, headers: {'Cache-Control': 'private, no-store'}},
  );
}
