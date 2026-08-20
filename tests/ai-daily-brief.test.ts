import {describe, expect, it} from 'vitest';
import {AIGroundingError} from '../src/lib/ai/errors';
import {
  OpenAIResponsesProvider,
  type ResponsesParseClient,
  type ResponsesParseParams,
  type ResponsesParseResult,
} from '../src/lib/ai/openai-responses-provider';
import type {DailyBriefCandidate, DailyBriefInput, DailyBriefNarrative} from '../src/lib/ai/schemas';

function candidate(id: string, overrides: Partial<DailyBriefCandidate> = {}): DailyBriefCandidate {
  return {
    id,
    company: `Company ${id}`,
    title: `Role ${id}`,
    status: 'DISCOVERED',
    freshness: 'NEW',
    eligibility: 'ELIGIBLE',
    expectedValuePerHour: 100,
    fitScore: 80,
    priority: 70,
    verifiedAt: '2026-08-16T09:00:00.000Z',
    nextAction: `Review ${id}`,
    sourceIds: [`source-${id}`],
    evidenceIds: [`evidence-${id}`],
    strengths: ['Verified alignment'],
    gaps: ['Allocation must be confirmed'],
    ...overrides,
  };
}

function input(): DailyBriefInput {
  return {
    context: {requestId: 'request-brief-001', subjectId: 'private-user-id'},
    asOf: '2026-08-16T11:00:00.000Z',
    maxItems: 5,
    candidates: [
      candidate('a', {expectedValuePerHour: 100, fitScore: 90}),
      candidate('b', {expectedValuePerHour: 200, fitScore: 70, freshness: 'FRESH'}),
      candidate('expired', {expectedValuePerHour: 900, freshness: 'EXPIRED'}),
      candidate('blocked', {expectedValuePerHour: 800, eligibility: 'NOT_ELIGIBLE'}),
      candidate('applied', {expectedValuePerHour: 700, status: 'APPLIED', freshness: 'CURRENT'}),
      candidate('future', {expectedValuePerHour: 1_000, verifiedAt: '2026-08-17T09:00:00.000Z'}),
    ],
  };
}

function narrative(actionIds: string[]): DailyBriefNarrative {
  return {
    headline: 'Two verified opportunities deserve review.',
    summary: 'The deterministic ranking prioritizes current eligible work.',
    actions: actionIds.map((id) => ({
      opportunityId: id,
      whyNow: `Review ${id} using the supplied evidence.`,
      evidenceIds: [`evidence-${id}`],
    })),
    warnings: ['Eligibility and allocation still require human confirmation.'],
    reviewRequired: true,
  };
}

function response(output: unknown): ResponsesParseResult {
  return {
    id: 'resp_brief_1',
    model: 'gpt-test-resolved',
    status: 'completed',
    error: null,
    output: [],
    output_parsed: output,
    usage: {input_tokens: 90, output_tokens: 40, total_tokens: 130},
  } as unknown as ResponsesParseResult;
}

class CapturingClient implements ResponsesParseClient {
  readonly requests: ResponsesParseParams[] = [];

  constructor(private readonly output: DailyBriefNarrative) {}

  async parse(params: ResponsesParseParams) {
    this.requests.push(params);
    return response(this.output);
  }
}

describe('deterministic daily brief selection', () => {
  it('filters first, ranks by deterministic business fields, then asks AI only for explanation', async () => {
    const client = new CapturingClient(narrative(['b', 'a']));
    const provider = new OpenAIResponsesProvider({
      client,
      model: 'gpt-test-pinned',
      now: () => new Date('2026-08-16T11:01:00.000Z'),
    });
    const result = await provider.generateDailyBrief(input());

    expect(result.selection.candidates.map((item) => item.id)).toEqual(['b', 'a']);
    expect(result.selection.metrics).toEqual({
      observed: 6,
      fresh: 5,
      eligible: 4,
      actionable: 2,
      selected: 2,
      liveSources: 5,
    });
    expect(client.requests).toHaveLength(1);
    expect(client.requests[0]).toMatchObject({
      store: false,
      tools: [],
      tool_choice: 'none',
      metadata: {use_case: 'DAILY_BRIEF'},
      text: {format: {type: 'json_schema', name: 'daily_brief_v1', strict: true}},
    });
    const payload = JSON.parse(String(client.requests[0].input));
    expect(payload.selection.candidates.map((item: {id: string}) => item.id)).toEqual(['b', 'a']);
    expect(result.narrative.actions.map((action) => action.opportunityId)).toEqual(['b', 'a']);
  });

  it('rejects any model attempt to reorder deterministic selections', async () => {
    const provider = new OpenAIResponsesProvider({
      client: new CapturingClient(narrative(['a', 'b'])),
      model: 'gpt-test',
    });
    await expect(provider.generateDailyBrief(input())).rejects.toThrow(AIGroundingError);
  });

  it('rejects evidence borrowed from a different opportunity', async () => {
    const wrongEvidence = narrative(['b', 'a']);
    wrongEvidence.actions[0].evidenceIds = ['evidence-a'];
    const provider = new OpenAIResponsesProvider({
      client: new CapturingClient(wrongEvidence),
      model: 'gpt-test',
    });
    await expect(provider.generateDailyBrief(input())).rejects.toThrow('DAILY_BRIEF_b_UNKNOWN_IDS');
  });

  it('fails closed when upstream data contains duplicate opportunity IDs', async () => {
    const duplicateInput = input();
    duplicateInput.candidates = [candidate('duplicate'), candidate('duplicate')];
    const client = new CapturingClient(narrative(['duplicate']));
    const provider = new OpenAIResponsesProvider({client, model: 'gpt-test'});
    await expect(provider.generateDailyBrief(duplicateInput)).rejects.toThrow('DAILY_BRIEF_DUPLICATE_CANDIDATE_IDS');
    expect(client.requests).toHaveLength(0);
  });
});
