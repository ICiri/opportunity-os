import {describe, expect, it} from 'vitest';
import {buildSuggestion} from '../src/lib/conversation/strategy';
import type {ConversationRecord, ConversationState} from '../src/lib/conversation/types';
import type {MailThreadSnapshot} from '../src/data/mailbox-types';

const record = (state: ConversationState, overrides: Partial<ConversationRecord> = {}): ConversationRecord => ({
  id: `thread-${state.toLowerCase()}`,
  company: 'Recorded Company',
  contact: 'Alex',
  country: 'EU',
  subject: 'Recorded backend role',
  sentAt: '2026-08-16T10:00:00.000Z',
  state,
  messageCount: 2,
  priority: 50,
  nextAction:
    state === 'NOT_A_FIT' ? 'Do not pressure; preserve the recorded constraint.' : 'Review the persisted evidence.',
  nextActionAt: state === 'REACTIVATE' ? '2026-10-15T00:00:00.000Z' : undefined,
  evidence: [
    {kind: 'FACT', text: 'A persisted Gmail message supports this test state.', source: 'Test-only recorded fixture'},
  ],
  ...overrides,
});

const thread = (withInbound = false): MailThreadSnapshot => ({
  gmailUrl: 'https://mail.google.com/mail/u/0/#all/thread-test',
  messages: [
    {
      id: 'm-out',
      direction: 'OUTBOUND',
      role: 'SENT_EMAIL',
      from: 'Ivan <ivan@example.test>',
      to: 'Alex <alex@example.test>',
      subject: 'Recorded backend role',
      sentAt: '2026-08-16T10:00:00.000Z',
      body: 'Test-only outbound body.',
      attachments: [],
    },
    ...(withInbound
      ? [
          {
            id: 'm-in',
            direction: 'INBOUND' as const,
            role: 'RECEIVED_REPLY' as const,
            from: 'Alex <alex@example.test>',
            to: 'Ivan <ivan@example.test>',
            subject: 'Recorded backend role',
            sentAt: '2026-08-16T11:00:00.000Z',
            body: 'Test-only inbound body.',
            attachments: [],
          },
        ]
      : []),
  ],
});

describe('conversation strategist contract', () => {
  it('always grounds suggestions in supplied evidence and requires approval', () => {
    for (const state of [
      'WAITING',
      'REFERRED',
      'WARM_RELATIONSHIP',
      'REACTIVATE',
      'DELIVERY_FAILURE',
      'NOT_A_FIT',
    ] as ConversationState[]) {
      const suggestion = buildSuggestion(record(state), thread(state !== 'WAITING'));
      expect(suggestion.evidence.length).toBeGreaterThan(0);
      expect(suggestion.requiresHumanApproval).toBe(true);
    }
  });
  it('preserves a recorded referral path', () => {
    const conversation = record('REFERRED', {
      evidence: [
        {kind: 'FACT', text: 'Inbound message matches the configured REFERRED phrase rule.', source: 'Test fixture'},
      ],
    });
    const suggestion = buildSuggestion(conversation, thread(true));
    expect(suggestion.draft).toContain('specific person I should contact next');
    expect(suggestion.draft).not.toMatch(/10[–-]20|verified role|payments fit/i);
  });
  it('does not draft pressure after an explicit poor fit', () => {
    const suggestion = buildSuggestion(record('NOT_A_FIT'), thread(true));
    expect(suggestion.draft).toBeUndefined();
    expect(suggestion.recommendedAction).toContain('Do not pressure');
  });
  it('keeps the recorded reactivation checkpoint', () => {
    const conversation = record('REACTIVATE');
    expect(conversation.nextActionAt).toBeTruthy();
    expect(buildSuggestion(conversation, thread(true)).recommendedTiming).toBe(conversation.nextActionAt);
  });
  it('fails closed when the decrypted thread is unavailable', () => {
    expect(buildSuggestion(record('WAITING')).draft).toBeUndefined();
  });
});
