import type {MailThreadSnapshot} from '@/data/mailbox-types';
import type {ConversationRecord, EvidenceKind} from './types';

export type PrincipleId =
  'VOSS_CALIBRATED_QUESTION' | 'GETTING_TO_YES_INTERESTS' | 'DIFFICULT_CONVERSATIONS_ACKNOWLEDGE';
export type ConversationSuggestion = {
  objective: string;
  lifecycle: string;
  evidence: {kind: EvidenceKind; text: string; source: string}[];
  principles: {id: PrincipleId; application: string}[];
  whatWorked: string[];
  risks: string[];
  missedOpportunities: string[];
  recommendedAction: string;
  recommendedTiming: string;
  draft?: string;
  alternatives: {label: string; whenToUse: string; draft: string}[];
  requiresHumanApproval: true;
};

function firstName(value: string) {
  const clean = value
    .trim()
    .split(/\s+/)[0]
    ?.replace(/[^\p{L}'-]/gu, '');
  return clean || 'there';
}

function oneLine(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 220);
}

function safeDraft(conversation: ConversationRecord, thread?: MailThreadSnapshot) {
  if (!thread || ['DELIVERY_FAILURE', 'NOT_A_FIT', 'UNKNOWN'].includes(conversation.state)) return undefined;
  const hasOutbound = thread.messages.some((message) => message.direction === 'OUTBOUND');
  if (!hasOutbound) return undefined;
  const inbound = thread.messages.filter((message) => message.direction === 'INBOUND');
  const greeting = `Hi ${firstName(conversation.contact)},`;
  const subject = oneLine(conversation.subject);
  const signoff = '\n\nBest,';
  const referralConfirmed = conversation.evidence.some(
    (item) => item.kind === 'FACT' && /referr|forward/i.test(item.text),
  );

  if (conversation.state === 'REFERRED' && referralConfirmed) {
    return `${greeting}\n\nThank you for your message regarding “${subject}”. Would you prefer that I wait for the introduction, or is there a specific person I should contact next?${signoff}`;
  }
  if (inbound.length > 0) {
    return `${greeting}\n\nThank you for your message regarding “${subject}”. What would be the most useful next step from your side? If there is no next step right now, I understand.${signoff}`;
  }
  return `${greeting}\n\nI am following up on my earlier message regarding “${subject}”. Could you let me know whether there is an appropriate next step? If not, no reply is required.${signoff}`;
}

export function buildSuggestion(conversation: ConversationRecord, thread?: MailThreadSnapshot): ConversationSuggestion {
  const draft = safeDraft(conversation, thread);
  const outbound = thread?.messages.filter((message) => message.direction === 'OUTBOUND') ?? [];
  const inbound = thread?.messages.filter((message) => message.direction === 'INBOUND') ?? [];
  const attachments = thread?.messages.flatMap((message) => message.attachments) ?? [];
  const whatWorked = [
    ...(outbound.length
      ? [`${outbound.length} outbound message${outbound.length === 1 ? '' : 's'} exist in the decrypted Gmail thread.`]
      : []),
    ...(inbound.length
      ? [`${inbound.length} inbound message${inbound.length === 1 ? '' : 's'} exist in the decrypted Gmail thread.`]
      : []),
    ...(attachments.length
      ? [`${attachments.length} attachment record${attachments.length === 1 ? '' : 's'} exist in Gmail metadata.`]
      : []),
  ];
  const principles: ConversationSuggestion['principles'] = draft
    ? [
        {
          id: 'GETTING_TO_YES_INTERESTS',
          application: 'Ask for the recipient’s preferred next step without inventing their constraints.',
        },
        {
          id: 'VOSS_CALIBRATED_QUESTION',
          application: 'Use one low-friction question whose answer can clarify the path.',
        },
        ...(inbound.length
          ? [
              {
                id: 'DIFFICULT_CONVERSATIONS_ACKNOWLEDGE' as const,
                application: 'Acknowledge the recorded inbound message before asking for anything else.',
              },
            ]
          : []),
      ]
    : [];
  return {
    objective: draft
      ? 'Request one explicit next-step signal without adding unsupported claims'
      : 'Review the real thread before drafting',
    lifecycle: conversation.state,
    evidence: conversation.evidence,
    principles,
    whatWorked,
    risks: [
      draft
        ? 'The wording is deterministic and source-limited; tone and recipient context still require human review.'
        : 'No safe source-linked draft is available for this lifecycle.',
    ],
    missedOpportunities: [],
    recommendedAction: conversation.nextAction,
    recommendedTiming:
      conversation.nextActionAt ?? 'No follow-up time is recorded; choose it manually after reviewing the thread.',
    draft,
    alternatives: [],
    requiresHumanApproval: true,
  };
}

export function evidenceChain(conversation: ConversationRecord) {
  const evidence = conversation.evidence[0] ?? {text: 'No deterministic evidence item is available.'};
  return {
    evidence: evidence.text,
    interpretation: `The persisted lifecycle is ${conversation.state.replaceAll('_', ' ').toLowerCase()}; this remains reviewable metadata, not an outcome guarantee.`,
    principle:
      conversation.state === 'DELIVERY_FAILURE'
        ? 'Validate the recipient before any new message'
        : 'Ask for one explicit next-step signal',
    recommendation: conversation.nextAction,
    expectedOutcome:
      'Obtain clearer information while preserving human control; no reply or business result is guaranteed.',
  };
}
