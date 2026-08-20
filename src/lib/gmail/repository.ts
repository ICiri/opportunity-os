import 'server-only';
import postgres from 'postgres';
import type {MailAttachment, MailMessageSnapshot, MailRole, MailThreadSnapshot} from '@/data/mailbox-types';
import {decodeDataKey, decryptText, gmailPayloadAad} from '@/lib/security/envelope';

type MessageRow = {
  id: string;
  sent_at: Date;
  direction: 'OUTBOUND' | 'INBOUND';
  from_address: string | null;
  to_addresses: string[];
  metadata: {role?: unknown; attachments?: unknown};
  subject_ciphertext: Buffer | null;
  subject_nonce: Buffer | null;
  body_ciphertext: Buffer;
  body_nonce: Buffer;
  aad_hash: string;
};

export type MailThreadSummary = {
  messages: number;
  inbound: number;
  pdfs: number;
  firstPdf?: string;
};

export type PrivateThreadSubject = {subject: string; messageId: string};

const validRole = (value: unknown): value is MailRole =>
  value === 'SENT_EMAIL' || value === 'RECEIVED_REPLY' || value === 'MY_LAST_EMAIL';

const parseAttachments = (value: unknown): MailAttachment[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate.filename !== 'string' ||
      typeof candidate.mimeType !== 'string' ||
      typeof candidate.sizeBytes !== 'number'
    )
      return [];
    return [{filename: candidate.filename, mimeType: candidate.mimeType, sizeBytes: candidate.sizeBytes}];
  });
};

function databaseUrl(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.NODE_ENV !== 'production') return 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
  return null;
}

export async function getPrivateMailThread(threadId: string, userId: string): Promise<MailThreadSnapshot | null> {
  const url = databaseUrl();
  if (!url) return null;
  const sql = postgres(url, {max: 1, prepare: false});
  try {
    const keys = await sql<{decrypted_secret: string}[]>`
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'opportunity_data_key_v1'
      limit 1
    `;
    if (!keys[0]?.decrypted_secret) throw new Error('Private mailbox encryption key is unavailable.');
    const key = decodeDataKey(keys[0].decrypted_secret);
    const rows = await sql<MessageRow[]>`
      select message.id, message.sent_at, message.direction, message.from_address,
        message.to_addresses, message.metadata, payload.subject_ciphertext,
        payload.subject_nonce, payload.body_ciphertext, payload.body_nonce, payload.aad_hash
      from public.email_messages message
      join private.gmail_message_payloads payload
        on payload.message_id = message.id and payload.user_id = message.user_id
      where message.thread_id = ${threadId} and message.user_id = ${userId}
      order by message.sent_at asc, message.id asc
    `;
    if (!rows.length) return null;

    const messages: MailMessageSnapshot[] = rows.map((row, index) => {
      const bodyAad = gmailPayloadAad(userId, row.id, 'body');
      const subjectAad = gmailPayloadAad(userId, row.id, 'subject');
      const subject =
        row.subject_ciphertext && row.subject_nonce
          ? decryptText(
              {ciphertext: row.subject_ciphertext, nonce: row.subject_nonce, aadHash: row.aad_hash.split(':')[0] ?? ''},
              key,
              subjectAad,
            )
          : '';
      const bodyHash = row.aad_hash.includes(':') ? row.aad_hash.split(':')[1] : row.aad_hash;
      const role = validRole(row.metadata?.role)
        ? row.metadata.role
        : row.direction === 'INBOUND'
          ? 'RECEIVED_REPLY'
          : index === 0
            ? 'SENT_EMAIL'
            : 'MY_LAST_EMAIL';
      return {
        id: row.id,
        direction: row.direction,
        role,
        from: row.from_address ?? '',
        to: row.to_addresses.join(', '),
        subject,
        sentAt: row.sent_at.toISOString(),
        body: decryptText({ciphertext: row.body_ciphertext, nonce: row.body_nonce, aadHash: bodyHash}, key, bodyAad),
        attachments: parseAttachments(row.metadata?.attachments),
      };
    });

    const gmailUrl = new URL('https://mail.google.com');
    gmailUrl.pathname = '/mail/u/0/';
    gmailUrl.hash = `all/${encodeURIComponent(threadId)}`;
    return {gmailUrl: gmailUrl.toString(), messages};
  } finally {
    await sql.end();
  }
}

export async function getPrivateMailThreadSummaries(userId: string): Promise<Record<string, MailThreadSummary>> {
  const url = databaseUrl();
  if (!url) return {};
  const sql = postgres(url, {max: 1, prepare: false});
  try {
    const rows = await sql<{thread_id: string; direction: 'OUTBOUND' | 'INBOUND'; metadata: {attachments?: unknown}}[]>`
      select thread_id, direction, metadata
      from public.email_messages
      where user_id = ${userId}
      order by sent_at asc, id asc
    `;
    return rows.reduce<Record<string, MailThreadSummary>>((result, row) => {
      const summary = result[row.thread_id] ?? {messages: 0, inbound: 0, pdfs: 0};
      const pdfs = parseAttachments(row.metadata?.attachments).filter((item) => item.mimeType === 'application/pdf');
      summary.messages += 1;
      summary.inbound += row.direction === 'INBOUND' ? 1 : 0;
      summary.pdfs += pdfs.length;
      summary.firstPdf ??= pdfs[0]?.filename;
      result[row.thread_id] = summary;
      return result;
    }, {});
  } finally {
    await sql.end();
  }
}

export async function getPrivateMailThreadSubjects(userId: string): Promise<Record<string, PrivateThreadSubject>> {
  const url = databaseUrl();
  if (!url) return {};
  const sql = postgres(url, {max: 1, prepare: false});
  try {
    const keys = await sql<{decrypted_secret: string}[]>`
      select decrypted_secret from vault.decrypted_secrets
      where name='opportunity_data_key_v1' limit 1
    `;
    if (!keys[0]?.decrypted_secret) throw new Error('Private mailbox encryption key is unavailable.');
    const key = decodeDataKey(keys[0].decrypted_secret);
    const rows = await sql<
      {
        thread_id: string;
        message_id: string;
        subject_ciphertext: Buffer;
        subject_nonce: Buffer;
        aad_hash: string;
      }[]
    >`
      select distinct on (message.thread_id)
        message.thread_id,message.id message_id,payload.subject_ciphertext,
        payload.subject_nonce,payload.aad_hash
      from public.email_messages message
      join private.gmail_message_payloads payload
        on payload.message_id=message.id and payload.user_id=message.user_id
      where message.user_id=${userId} and payload.subject_ciphertext is not null
        and payload.subject_nonce is not null
      order by message.thread_id,message.sent_at,message.id
    `;
    return Object.fromEntries(
      rows.map((row) => [
        row.thread_id,
        {
          messageId: row.message_id,
          subject: decryptText(
            {ciphertext: row.subject_ciphertext, nonce: row.subject_nonce, aadHash: row.aad_hash.split(':')[0] ?? ''},
            key,
            gmailPayloadAad(userId, row.message_id, 'subject'),
          ),
        },
      ]),
    );
  } finally {
    await sql.end();
  }
}
