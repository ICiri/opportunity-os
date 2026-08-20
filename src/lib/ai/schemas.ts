import {z} from 'zod';

const id = z.string().trim().min(1).max(128);
const shortText = z.string().trim().min(1).max(500);
const bodyText = z.string().trim().min(1).max(20_000);

export const aiCallContextSchema = z.object({
  requestId: z.string().trim().min(1).max(64),
  subjectId: z.string().trim().min(1).max(256),
});

export const verifiedCareerFactSchema = z.object({
  id,
  statement: z.string().trim().min(1).max(2_000),
  evidence: z.string().trim().min(1).max(4_000),
  verified: z.literal(true),
});

export const baseCvBulletSchema = z.object({
  id,
  text: z.string().trim().min(1).max(2_000),
  factIds: z.array(id).min(1).max(20),
});

export const cvTailoringInputSchema = z.object({
  context: aiCallContextSchema,
  language: z.enum(['en', 'hr']),
  opportunity: z.object({
    id,
    company: shortText,
    title: shortText,
    description: bodyText,
    requirements: z.array(shortText).max(100),
    evidenceIds: z.array(id).min(1).max(100),
  }),
  baseCv: z.object({
    id,
    headline: z.string().trim().min(1).max(500),
    summary: z.string().trim().min(1).max(4_000),
    bullets: z.array(baseCvBulletSchema).min(1).max(100),
  }),
  verifiedFacts: z.array(verifiedCareerFactSchema).min(1).max(200),
});

const groundedHeadlineSchema = z.object({
  text: z.string().trim().min(1).max(500),
  factIds: z.array(id).min(1).max(30),
});

const groundedSummarySchema = z.object({
  text: z.string().trim().min(1).max(4_000),
  factIds: z.array(id).min(1).max(50),
});

export const cvTailoringDraftSchema = z.object({
  headline: groundedHeadlineSchema,
  summary: groundedSummarySchema,
  bulletChanges: z
    .array(
      z.object({
        sourceBulletId: id,
        text: z.string().trim().min(1).max(2_000),
        factIds: z.array(id).min(1).max(30),
        rationale: z.string().trim().min(1).max(1_000),
      }),
    )
    .max(30),
  gaps: z.array(z.string().trim().min(1).max(1_000)).max(30),
  warnings: z.array(z.string().trim().min(1).max(1_000)).max(30),
  unsupportedClaims: z.array(z.string().trim().min(1).max(1_000)).max(30),
  reviewRequired: z.literal(true),
});

export const dailyBriefCandidateSchema = z.object({
  id,
  company: shortText,
  title: shortText,
  status: z.enum(['DISCOVERED', 'REVIEW', 'CV_PREPARED', 'APPLIED', 'REPLIED']),
  freshness: z.enum(['NEW', 'FRESH', 'CURRENT', 'AGING', 'EXPIRED', 'UNKNOWN']),
  eligibility: z.enum(['ELIGIBLE', 'LIKELY_ELIGIBLE', 'UNKNOWN', 'NOT_ELIGIBLE']),
  expectedValuePerHour: z.number().finite().min(0),
  fitScore: z.number().finite().min(0).max(100),
  priority: z.number().finite().min(0).max(100),
  verifiedAt: z.string().datetime({offset: true}),
  nextAction: z.string().trim().min(1).max(2_000),
  sourceIds: z.array(id).min(1).max(100),
  evidenceIds: z.array(id).min(1).max(100),
  strengths: z.array(shortText).max(30),
  gaps: z.array(shortText).max(30),
});

export const dailyBriefInputSchema = z.object({
  context: aiCallContextSchema,
  asOf: z.string().datetime({offset: true}),
  maxItems: z.number().int().min(1).max(10).default(5),
  candidates: z.array(dailyBriefCandidateSchema).max(1_000),
});

export const dailyBriefNarrativeSchema = z.object({
  headline: z.string().trim().min(1).max(500),
  summary: z.string().trim().min(1).max(3_000),
  actions: z
    .array(
      z.object({
        opportunityId: id,
        whyNow: z.string().trim().min(1).max(1_500),
        evidenceIds: z.array(id).min(1).max(100),
      }),
    )
    .max(10),
  warnings: z.array(z.string().trim().min(1).max(1_000)).max(30),
  reviewRequired: z.literal(true),
});

export type AICallContext = z.infer<typeof aiCallContextSchema>;
export type VerifiedCareerFact = z.infer<typeof verifiedCareerFactSchema>;
export type CvTailoringInput = z.infer<typeof cvTailoringInputSchema>;
export type CvTailoringDraft = z.infer<typeof cvTailoringDraftSchema>;
export type DailyBriefCandidate = z.infer<typeof dailyBriefCandidateSchema>;
export type DailyBriefInput = z.infer<typeof dailyBriefInputSchema>;
export type DailyBriefNarrative = z.infer<typeof dailyBriefNarrativeSchema>;
