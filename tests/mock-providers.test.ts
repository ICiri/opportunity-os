import {describe, expect, it} from 'vitest';
import {MockAIProvider} from '../src/lib/ai/mock-provider';
import type {CvTailoringInput, DailyBriefInput} from '../src/lib/ai/schemas';
import {MockEmailProvider} from '../src/lib/email/mock-provider';

describe('MockEmailProvider', () => {
  const messages = ['c', 'a', 'b'].map((id, index) => ({
    id,
    threadId: 'thread-1',
    direction: 'INBOUND' as const,
    from: {address: 'sender@example.test'},
    to: [{address: 'user@example.test'}],
    subject: id,
    body: `body-${id}`,
    sentAt: `2026-08-16T10:0${index}:00.000Z`,
  }));
  it('paginates deterministically without exposing mutable fixtures', async () => {
    const provider = new MockEmailProvider(messages),
      first = await provider.fetchIncremental({limit: 2});
    expect(first.messages.map((message) => message.id)).toEqual(['c', 'a']);
    expect(first.nextCursor).toBe('2');
    first.messages[0].body = 'changed';
    expect((await provider.fetchIncremental({limit: 2})).messages[0].body).toBe('body-c');
    await expect(provider.fetchIncremental({cursor: first.nextCursor!, limit: 2})).resolves.toMatchObject({
      messages: [{id: 'b'}],
      nextCursor: null,
    });
  });
  it('fails closed on invalid paging input', async () => {
    const provider = new MockEmailProvider(messages);
    await expect(provider.fetchIncremental({cursor: 'bad'})).rejects.toThrow('EMAIL_CURSOR_INVALID');
    await expect(provider.fetchIncremental({limit: 0})).rejects.toThrow('EMAIL_PAGE_LIMIT_INVALID');
  });
});

describe('MockAIProvider', () => {
  const context = {requestId: 'request-1', subjectId: 'private-user'};
  const provider = new MockAIProvider(() => new Date('2026-08-16T11:00:00.000Z'));
  it('creates deterministic fact-grounded CV output and audit metadata', async () => {
    const input: CvTailoringInput = {
      context,
      language: 'en',
      opportunity: {
        id: 'op-1',
        company: 'Acme',
        title: 'Engineer',
        description: 'Build APIs.',
        requirements: ['Go'],
        evidenceIds: ['snapshot-1'],
      },
      baseCv: {
        id: 'base-1',
        headline: 'Engineer',
        summary: 'Backend engineer.',
        bullets: [{id: 'bullet-1', text: 'Builds APIs.', factIds: ['fact-1']}],
      },
      verifiedFacts: [{id: 'fact-1', statement: 'Builds payment APIs', evidence: 'Approved CV', verified: true}],
    };
    const first = await provider.tailorCv(input),
      second = await provider.tailorCv(input);
    expect(first.draft.summary).toEqual({text: 'Builds payment APIs', factIds: ['fact-1']});
    expect(first.draft.gaps).toEqual(['Go']);
    expect(first.audit).toMatchObject({provider: 'mock', useCase: 'CV_TAILOR', usage: null});
    expect(second.audit.outputHash).toBe(first.audit.outputHash);
  });
  it('uses existing deterministic daily-brief selection', async () => {
    const input: DailyBriefInput = {
      context,
      asOf: '2026-08-16T11:00:00.000Z',
      maxItems: 1,
      candidates: ['low', 'high'].map((id, index) => ({
        id,
        company: 'Acme',
        title: id,
        status: 'DISCOVERED' as const,
        freshness: 'NEW' as const,
        eligibility: 'ELIGIBLE' as const,
        expectedValuePerHour: index ? 200 : 100,
        fitScore: 80,
        priority: 70,
        verifiedAt: '2026-08-16T10:00:00.000Z',
        nextAction: `Review ${id}`,
        sourceIds: [`source-${id}`],
        evidenceIds: [`evidence-${id}`],
        strengths: [],
        gaps: [],
      })),
    };
    const result = await provider.generateDailyBrief(input);
    expect(result.selection.candidates.map((candidate) => candidate.id)).toEqual(['high']);
    expect(result.narrative.actions).toEqual([
      {opportunityId: 'high', whyNow: 'Review high', evidenceIds: ['evidence-high']},
    ]);
  });
});
