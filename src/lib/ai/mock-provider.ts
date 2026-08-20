import type {AIProvider, AIAuditMetadata, CvTailoringResult, DailyBriefResult} from './contracts';
import {selectDailyBriefCandidates} from './daily-brief';
import {assertCvDraftGrounded, assertCvInputGrounded, assertDailyBriefGrounded} from './grounding';
import {hashJson, sha256} from './hash';
import {cvTailoringInputSchema, dailyBriefInputSchema, type CvTailoringInput, type DailyBriefInput} from './schemas';
export class MockAIProvider implements AIProvider {
  readonly kind = 'mock' as const;
  constructor(private readonly now: () => Date = () => new Date()) {}
  async tailorCv(raw: CvTailoringInput): Promise<CvTailoringResult> {
    const input = cvTailoringInputSchema.parse(raw);
    assertCvInputGrounded(input);
    const fact = input.verifiedFacts[0];
    const draft = {
      headline: {text: fact.statement, factIds: [fact.id]},
      summary: {text: fact.statement, factIds: [fact.id]},
      bulletChanges: [],
      gaps: input.opportunity.requirements.filter(
        (r) => !input.verifiedFacts.some((f) => f.statement.toLowerCase().includes(r.toLowerCase())),
      ),
      warnings: ['Mock output requires human review.'],
      unsupportedClaims: [],
      reviewRequired: true as const,
    };
    assertCvDraftGrounded(input, draft);
    return {draft, audit: this.audit('CV_TAILOR', input.context, input, draft)};
  }
  async generateDailyBrief(raw: DailyBriefInput): Promise<DailyBriefResult> {
    const input = dailyBriefInputSchema.parse(raw),
      selection = selectDailyBriefCandidates(input);
    const narrative = {
      headline: selection.candidates.length ? 'Review the selected opportunities.' : 'No actionable opportunities.',
      summary: 'Deterministic mock brief generated from the supplied candidates.',
      actions: selection.candidates.map((c) => ({
        opportunityId: c.id,
        whyNow: c.nextAction,
        evidenceIds: c.evidenceIds,
      })),
      warnings: ['Mock output requires human review.'],
      reviewRequired: true as const,
    };
    assertDailyBriefGrounded(selection, narrative);
    return {selection, narrative, audit: this.audit('DAILY_BRIEF', input.context, input, narrative)};
  }
  private audit(
    useCase: AIAuditMetadata['useCase'],
    context: {requestId: string; subjectId: string},
    input: unknown,
    output: unknown,
  ): AIAuditMetadata {
    const inputHash = hashJson(input);
    return {
      provider: 'mock',
      useCase,
      requestId: context.requestId,
      subjectHash: sha256(context.subjectId),
      responseId: `mock_${inputHash.slice(0, 24)}`,
      modelRequested: 'deterministic-mock-v1',
      modelResolved: 'deterministic-mock-v1',
      promptVersion: 'mock-v1',
      schemaVersion: 'mock-v1',
      promptHash: sha256(`mock:${useCase}:v1`),
      inputHash,
      outputHash: hashJson(output),
      generatedAt: this.now().toISOString(),
      usage: null,
    };
  }
}
