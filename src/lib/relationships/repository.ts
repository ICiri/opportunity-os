import 'server-only';
import {createHash} from 'node:crypto';
import postgres from 'postgres';
import {getPrivateMailThreadSubjects} from '@/lib/gmail/repository';
import type {GraphEdge, GraphNode, RelationshipGraphModel} from './graph';

type ThreadMessage = {direction: 'OUTBOUND' | 'INBOUND'; fromAddress: string | null; toAddresses: string[]};
type ThreadRow = {
  id: string;
  company_id: string | null;
  company: string | null;
  canonical_name: string | null;
  relationship_score: number | null;
  subject: string | null;
  lifecycle: string | null;
  priority: number | null;
  next_action: string | null;
  next_action_at: Date | null;
  created_at: Date;
  messages: ThreadMessage[];
};

export type RelationshipGap = {id: string; title: string; detail: string; action: string};
export type Company360 = {
  id: string;
  name: string;
  canonicalName: string;
  country: string | null;
  relationshipScore: number;
  openRoles: number;
  threads: number;
  messages: number;
  lifecycle: string | null;
  graph: RelationshipGraphModel;
  history: {at: string; title: string; detail: string}[];
};

function databaseUrl(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.NODE_ENV !== 'production') return 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
  return null;
}

const identityHash = (value: string) => createHash('sha256').update(value.toLowerCase()).digest('hex').slice(0, 16);

function extractEmail(value: string | null | undefined) {
  return value?.match(/<?([^<>\s,;]+@[^<>\s,;]+)>?/)?.[1]?.toLowerCase();
}

function identityLabel(value: string | null | undefined, email?: string) {
  const display = value?.match(/^\s*"?([^"<]+)"?\s*</)?.[1]?.trim();
  if (display) return display;
  return email?.split('@')[0]?.replace(/[._-]+/g, ' ') || 'Unresolved participant';
}

function externalParticipants(messages: ThreadMessage[]) {
  const result = new Map<string, {email: string; label: string}>();
  for (const message of messages) {
    const rawAddresses = message.direction === 'INBOUND' ? [message.fromAddress] : message.toAddresses;
    for (const raw of rawAddresses) {
      const email = extractEmail(raw);
      if (email && !result.has(email)) result.set(email, {email, label: identityLabel(raw, email)});
    }
  }
  return [...result.values()];
}

function selfLabel(rows: ThreadRow[]) {
  for (const row of rows) {
    const outbound = row.messages.find((message) => message.direction === 'OUTBOUND' && message.fromAddress);
    if (outbound?.fromAddress) return identityLabel(outbound.fromAddress, extractEmail(outbound.fromAddress));
  }
  return 'Local user';
}

function buildGraph(rows: ThreadRow[], title: string, userId: string): RelationshipGraphModel {
  if (!rows.length) return {nodes: [], edges: [], height: 430, title};
  const height = Math.max(430, rows.length * 145 + 90);
  const nodes = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();
  const userNodeId = `user:${identityHash(userId)}`;
  nodes.set(userNodeId, {id: userNodeId, label: selfLabel(rows), type: 'USER', x: 80, y: height / 2});

  const addEdge = (edge: GraphEdge) => {
    const key = `${edge.from}:${edge.to}:${edge.label}`;
    const existing = edgeMap.get(key);
    if (!existing) {
      edgeMap.set(key, edge);
      return;
    }
    if (!existing.evidence.includes(edge.evidence)) existing.evidence = `${existing.evidence} | ${edge.evidence}`;
    const rank = {FACT: 0, INFERENCE: 1, UNKNOWN: 2} as const;
    if (rank[edge.provenance] > rank[existing.provenance]) existing.provenance = edge.provenance;
  };

  rows.forEach((row, rowIndex) => {
    const y = 70 + rowIndex * 145;
    const companyId = row.company_id ? `company:${row.company_id}` : `company:unknown:${row.id}`;
    const threadId = `thread:${row.id}`;
    const contacts = externalParticipants(row.messages);
    if (!nodes.has(companyId))
      nodes.set(companyId, {id: companyId, label: row.company ?? 'Company not linked', type: 'COMPANY', x: 535, y});
    nodes.set(threadId, {
      id: threadId,
      label: row.subject || 'Encrypted subject unavailable',
      type: 'THREAD',
      x: 785,
      y,
    });
    addEdge({
      from: companyId,
      to: threadId,
      label: row.company_id ? 'TRACKED THREAD' : 'COMPANY UNKNOWN',
      provenance: row.company_id ? 'FACT' : 'UNKNOWN',
      evidence: row.company_id
        ? `email_threads.company_id links thread ${row.id}`
        : `Thread ${row.id} has no company_id`,
    });

    if (!contacts.length) {
      const unknownId = `contact:unknown:${row.id}`;
      nodes.set(unknownId, {id: unknownId, label: 'Participant unresolved', type: 'CONTACT', x: 295, y});
      addEdge({
        from: unknownId,
        to: threadId,
        label: 'PARTICIPANT UNKNOWN',
        provenance: 'UNKNOWN',
        evidence: `No parseable external email address exists for thread ${row.id}`,
      });
      return;
    }

    contacts.forEach((contact, contactIndex) => {
      const contactId = `contact:${identityHash(contact.email)}`;
      if (!nodes.has(contactId))
        nodes.set(contactId, {id: contactId, label: contact.label, type: 'CONTACT', x: 295, y: y + contactIndex * 32});
      const outbound = row.messages.filter(
        (message) =>
          message.direction === 'OUTBOUND' &&
          message.toAddresses.some((address) => extractEmail(address) === contact.email),
      ).length;
      const inbound = row.messages.filter(
        (message) => message.direction === 'INBOUND' && extractEmail(message.fromAddress) === contact.email,
      ).length;
      if (outbound > 0)
        addEdge({
          from: userNodeId,
          to: contactId,
          label: 'CONTACTED',
          provenance: 'FACT',
          evidence: `${outbound} outbound message(s) addressed to ${contact.email} in thread ${row.id}`,
        });
      if (inbound > 0)
        addEdge({
          from: contactId,
          to: userNodeId,
          label: 'INBOUND MAIL',
          provenance: 'FACT',
          evidence: `${inbound} inbound message(s) from ${contact.email} in thread ${row.id}; human/automatic is not classified`,
        });
      addEdge({
        from: contactId,
        to: threadId,
        label: 'PARTICIPATED',
        provenance: 'FACT',
        evidence: `${outbound} outbound to and ${inbound} inbound from ${contact.email} in thread ${row.id}`,
      });
      addEdge({
        from: contactId,
        to: companyId,
        label: row.company_id ? 'ASSOCIATED' : 'COMPANY UNKNOWN',
        provenance: row.company_id ? 'INFERENCE' : 'UNKNOWN',
        evidence: row.company_id
          ? `The address appears in a thread grouped under ${row.company}; employment was not independently verified.`
          : `The address appears in thread ${row.id}, which has no linked company.`,
      });
    });
  });

  return {nodes: [...nodes.values()], edges: [...edgeMap.values()], height, title};
}

async function loadThreadRows(
  sql: ReturnType<typeof postgres>,
  userId: string,
  filter?: {threadId?: string; companyId?: string},
) {
  return sql<ThreadRow[]>`
    select thread.id,thread.company_id,company.name company,company.canonical_name,
      company.relationship_score,thread.subject,thread.lifecycle,thread.priority,
      thread.next_action,thread.next_action_at,thread.created_at,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'direction',message.direction,
          'fromAddress',message.from_address,
          'toAddresses',message.to_addresses
        ) order by message.sent_at,message.id)
        from public.email_messages message
        where message.user_id=thread.user_id and message.thread_id=thread.id
      ),'[]'::jsonb) messages
    from public.email_threads thread
    left join public.companies company on company.id=thread.company_id and company.user_id=thread.user_id
    where thread.user_id=${userId}
      and (${filter?.threadId ?? null}::text is null or thread.id=${filter?.threadId ?? null})
      and (${filter?.companyId ?? null}::uuid is null or thread.company_id=${filter?.companyId ?? null})
    order by thread.priority desc nulls last,thread.created_at desc
  `;
}

async function attachPrivateSubjects(rows: ThreadRow[], userId: string) {
  const subjects = await getPrivateMailThreadSubjects(userId);
  return rows.map((row) => ({...row, subject: subjects[row.id]?.subject ?? null}));
}

export async function loadRelationshipGraph(
  userId: string,
  filter?: {threadId?: string; companyId?: string},
): Promise<RelationshipGraphModel | null> {
  const url = databaseUrl();
  if (!url) return null;
  const sql = postgres(url, {max: 1, prepare: false});
  try {
    const rows = await attachPrivateSubjects(await loadThreadRows(sql, userId, filter), userId);
    return buildGraph(
      rows,
      filter?.threadId ? 'Persisted relationship path for this Gmail thread' : 'Persisted Gmail relationship paths',
      userId,
    );
  } catch {
    return null;
  } finally {
    await sql.end();
  }
}

export async function loadRelationshipGaps(userId: string): Promise<RelationshipGap[] | null> {
  const url = databaseUrl();
  if (!url) return null;
  const sql = postgres(url, {max: 1, prepare: false});
  try {
    const rows = await loadThreadRows(sql, userId);
    return rows.flatMap((row) => {
      const detail = row.next_action ?? 'Review the encrypted Gmail thread and record a next action.';
      if (row.lifecycle === 'REFERRED')
        return [
          {
            id: row.id,
            title: `${row.company ?? 'Unlinked company'} referral path needs a recorded owner`,
            detail,
            action: row.next_action_at?.toISOString().slice(0, 10) ?? 'VERIFY',
          },
        ];
      if (row.lifecycle === 'DELIVERY_FAILURE')
        return [
          {id: row.id, title: `${row.company ?? 'Unlinked company'} contact path is blocked`, detail, action: 'VERIFY'},
        ];
      return [];
    });
  } catch {
    return null;
  } finally {
    await sql.end();
  }
}

export async function loadCompany360(userId: string, slug: string): Promise<Company360 | null> {
  const url = databaseUrl();
  if (!url) return null;
  const sql = postgres(url, {max: 1, prepare: false});
  try {
    const companies = await sql<
      {
        id: string;
        name: string;
        canonical_name: string;
        country: string | null;
        relationship_score: number | null;
        open_roles: number;
      }[]
    >`
      select company.id,company.name,company.canonical_name,company.country,company.relationship_score,
        (select count(*)::int from public.job_postings posting
          where posting.user_id=company.user_id and posting.company_id=company.id
            and posting.availability_status='LIVE' and posting.last_verified_at >= now() - interval '26 hours'
            and exists(select 1 from public.job_sources reference
              join public.search_runs run on run.id=reference.last_search_run_id
              where reference.job_posting_id=posting.id and reference.verification_status='FEED_PRESENT'
                and run.user_id=company.user_id and run.status in ('SUCCESS','PARTIAL_SUCCESS')
                and run.audit_status='PASS' and run.finished_at >= now() - interval '26 hours')) open_roles
      from public.companies company
      where company.user_id=${userId} and company.canonical_name=${slug}
      limit 1
    `;
    const company = companies[0];
    if (!company) return null;
    const rows = await attachPrivateSubjects(await loadThreadRows(sql, userId, {companyId: company.id}), userId);
    const messageCount = rows.reduce((sum, row) => sum + row.messages.length, 0);
    const history = rows
      .flatMap((row) => [
        {
          at: row.created_at.toISOString(),
          title: 'Conversation tracked',
          detail: `${row.subject ?? 'Encrypted subject unavailable'} · ${(row.lifecycle ?? 'UNKNOWN').replaceAll('_', ' ')}`,
        },
        ...(row.next_action_at
          ? [
              {
                at: row.next_action_at.toISOString(),
                title: 'Recorded next action',
                detail: row.next_action ?? 'Next-action text unavailable',
              },
            ]
          : []),
      ])
      .sort((left, right) => left.at.localeCompare(right.at));
    return {
      id: company.id,
      name: company.name,
      canonicalName: company.canonical_name,
      country: company.country,
      relationshipScore: company.relationship_score ?? 0,
      openRoles: company.open_roles,
      threads: rows.length,
      messages: messageCount,
      lifecycle: rows[0]?.lifecycle ?? null,
      graph: buildGraph(rows, `Persisted relationship paths for ${company.name}`, userId),
      history,
    };
  } catch {
    return null;
  } finally {
    await sql.end();
  }
}
