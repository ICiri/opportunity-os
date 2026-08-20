import 'server-only';
import postgres from 'postgres';
import {getPrivateMailThread, getPrivateMailThreadSubjects} from '@/lib/gmail/repository';
import type {MailThreadSnapshot} from '@/data/mailbox-types';
import type {ConversationRecord, ConversationState} from './types';

type ConversationRow = {
  id: string;
  company: string | null;
  country: string | null;
  subject: string | null;
  lifecycle: string | null;
  priority: number | null;
  next_action: string | null;
  next_action_at: Date | null;
  created_at: Date;
  first_sent_at: Date | null;
  outbound_count: number;
  inbound_count: number;
  first_outbound_to: string | null;
  first_inbound_from: string | null;
};

export type ConversationWorkspaceData = {conversation: ConversationRecord; thread: MailThreadSnapshot};

const states = new Set<ConversationState>([
  'WAITING',
  'REFERRED',
  'WARM_RELATIONSHIP',
  'REACTIVATE',
  'DELIVERY_FAILURE',
  'NOT_A_FIT',
]);

function databaseUrl(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.NODE_ENV !== 'production') return 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
  return null;
}

function contactLabel(value: string | null) {
  if (!value) return 'Contact not resolved';
  const display = value.match(/^\s*"?([^"<]+)"?\s*</)?.[1]?.trim();
  if (display) return display;
  const address = value.match(/<?([^<>\s]+@[^<>\s]+)>?/)?.[1];
  return address?.split('@')[0]?.replace(/[._-]+/g, ' ') || 'Contact not resolved';
}

function normalizeState(value: string | null): ConversationState {
  return value && states.has(value as ConversationState) ? (value as ConversationState) : 'UNKNOWN';
}

function lifecycleEvidence(state: ConversationState, thread?: MailThreadSnapshot): ConversationRecord['evidence'] {
  if (!thread)
    return [
      {
        kind: 'INFERENCE',
        text: `The persisted audit lifecycle is ${state.replaceAll('_', ' ')}; encrypted content was not opened for this list view.`,
        source: 'email_threads.lifecycle',
      },
    ];
  const inbound = thread.messages.filter((message) => message.direction === 'INBOUND');
  const rules: Partial<Record<ConversationState, {pattern: RegExp; text: string}>> = {
    REFERRED: {
      pattern:
        /forwarded (?:your|the) (?:cv|resume|profile)|shared (?:your|the) (?:cv|resume|profile)|(?:introduce|connect) you (?:to|with)|(?:colleague|hiring manager|recruiter)[\s\S]{0,80}(?:contact|reach out|review)/,
      text: 'An inbound Gmail message contains a specific referral, introduction or profile-forwarding phrase.',
    },
    WARM_RELATIONSHIP: {
      pattern: /stay in (?:touch|contact)|keep in (?:touch|contact)|profile.*(?:good|strong)|looks.*good/,
      text: 'An inbound Gmail message contains a positive relationship-continuity signal.',
    },
    REACTIVATE: {
      pattern:
        /no (?:current )?capacity|process (?:is|was) (?:paused|on hold)|reconnect (?:in|when)|not hiring (?:right now|at the moment)/,
      text: 'An inbound Gmail message contains a specific timing, capacity or later-contact phrase.',
    },
    DELIVERY_FAILURE: {
      pattern: /delivery status|domain.*(?:not be found|couldn.t be found)|address not found|undeliver/,
      text: 'The encrypted Gmail thread contains a delivery-failure signal.',
    },
    NOT_A_FIT: {
      pattern:
        /not (?:a|the) (?:right )?fit|profile[\s\S]{0,60}(?:does not|doesn't|did not)[\s\S]{0,40}match|we (?:do not|don't) have[\s\S]{0,60}(?:role|opening)/,
      text: 'An inbound Gmail message contains a specific no-fit or no-matching-role phrase.',
    },
  };
  const rule = rules[state];
  const matchedMessage = rule ? inbound.find((message) => rule.pattern.test(message.body.toLowerCase())) : undefined;
  if (rule && matchedMessage)
    return [
      {
        kind: 'FACT',
        text: `Inbound message ${matchedMessage.id} matches the configured ${state.replaceAll('_', ' ')} phrase rule.`,
        source: `Encrypted inbound Gmail body · deterministic literal-pattern match`,
      },
      {
        kind: 'INFERENCE',
        text: `${rule.text} The lifecycle meaning still requires human review.`,
        source: 'Conversation classification rule',
      },
    ];
  if (state === 'WAITING' && inbound.length === 0)
    return [
      {
        kind: 'FACT',
        text: 'The stored Gmail thread has outbound mail and no inbound message.',
        source: 'Persisted Gmail message directions',
      },
      {kind: 'INFERENCE', text: 'No reply is not evidence of rejection.', source: 'Conversation lifecycle rule'},
    ];
  return [
    {
      kind: 'INFERENCE',
      text: `The persisted lifecycle is ${state.replaceAll('_', ' ')}, but the deterministic content rule did not independently reproduce it.`,
      source: 'Imported audit metadata; human re-check required',
    },
  ];
}

function toRecord(row: ConversationRow, thread?: MailThreadSnapshot): ConversationRecord {
  const state = normalizeState(row.lifecycle);
  const messageCount = row.outbound_count + row.inbound_count;
  return {
    id: row.id,
    company: row.company ?? 'Company not linked',
    contact: contactLabel(row.first_inbound_from ?? row.first_outbound_to),
    country: row.country ?? 'UNKNOWN',
    subject: thread?.messages[0]?.subject || row.subject || 'Subject unavailable',
    sentAt: (row.first_sent_at ?? row.created_at).toISOString(),
    state,
    messageCount,
    priority: Math.max(0, Math.min(100, row.priority ?? 0)),
    nextAction: row.next_action ?? 'Review the persisted Gmail thread and record a human-approved next action.',
    nextActionAt: row.next_action_at?.toISOString(),
    evidence: lifecycleEvidence(state, thread),
  };
}

async function queryRows(sql: ReturnType<typeof postgres>, userId: string, threadId?: string) {
  return sql<ConversationRow[]>`
    select thread.id,company.name company,company.country,thread.subject,thread.lifecycle,
      thread.priority,thread.next_action,thread.next_action_at,thread.created_at,
      min(message.sent_at) first_sent_at,
      count(*) filter (where message.direction='OUTBOUND')::int outbound_count,
      count(*) filter (where message.direction='INBOUND')::int inbound_count,
      (array_agg(message.to_addresses[1] order by message.sent_at) filter (where message.direction='OUTBOUND'))[1] first_outbound_to,
      (array_agg(message.from_address order by message.sent_at) filter (where message.direction='INBOUND'))[1] first_inbound_from
    from public.email_threads thread
    join public.email_messages message on message.thread_id=thread.id and message.user_id=thread.user_id
    left join public.companies company on company.id=thread.company_id and company.user_id=thread.user_id
    where thread.user_id=${userId} and (${threadId ?? null}::text is null or thread.id=${threadId ?? null})
    group by thread.id,company.name,company.country
    order by thread.priority desc nulls last,thread.created_at desc
  `;
}

export async function listPersistedConversations(userId: string): Promise<ConversationRecord[] | null> {
  const url = databaseUrl();
  if (!url) return null;
  const sql = postgres(url, {max: 1, prepare: false});
  try {
    const [rows, subjects] = await Promise.all([queryRows(sql, userId), getPrivateMailThreadSubjects(userId)]);
    return rows.map((row) => toRecord({...row, subject: subjects[row.id]?.subject ?? null}));
  } catch {
    return null;
  } finally {
    await sql.end();
  }
}

export async function getPersistedConversation(
  userId: string,
  threadId: string,
): Promise<ConversationWorkspaceData | null> {
  const url = databaseUrl();
  if (!url) return null;
  const sql = postgres(url, {max: 1, prepare: false});
  try {
    const row = (await queryRows(sql, userId, threadId))[0];
    if (!row) return null;
    const thread = await getPrivateMailThread(threadId, userId);
    if (!thread) return null;
    return {conversation: toRecord(row, thread), thread};
  } finally {
    await sql.end();
  }
}
