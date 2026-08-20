import 'server-only';
import {createHash, randomUUID} from 'node:crypto';
import postgres from 'postgres';
import {aiPayloadAad, cvPayloadAad, decodeDataKey, decryptBytes, encryptBytes} from '../security/envelope';

export type StoredCvPdf = {
  id: string;
  language: 'EN' | 'HR';
  version: number;
  contentHash: string;
  bytes: Buffer;
};

export type CvDraftDocument = {
  language: 'EN' | 'HR';
  opportunityId: string;
  title: string;
  summary: string;
  factDrafts: Array<{sourceFactId: string; category: 'EXPERIENCE' | 'SKILL'; text: string}>;
  sourceCvVersionId: string;
  sourceHash: string;
  sourceFactIds: string[];
  aiRunId?: string;
  reviewRequired: true;
};

export type CvVersionMetadata = {
  id: string;
  category: string;
  language: 'EN' | 'HR';
  version: number;
  lifecycle: 'DRAFT' | 'APPROVED' | 'ARCHIVED';
  contentHash: string;
  createdAt: string;
};

function databaseUrl(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.NODE_ENV !== 'production') return 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
  return null;
}

export async function getStoredCvPdf(language: 'EN' | 'HR', userId: string): Promise<StoredCvPdf | null> {
  const url = databaseUrl();
  if (!url) return null;
  const sql = postgres(url, {max: 1, prepare: false});
  try {
    const keys = await sql<{decrypted_secret: string}[]>`
      select decrypted_secret from vault.decrypted_secrets
      where name = 'opportunity_data_key_v1' limit 1
    `;
    if (!keys[0]?.decrypted_secret) throw new Error('Private CV encryption key is unavailable.');
    const rows = await sql<
      {
        id: string;
        language: 'EN' | 'HR';
        version: number;
        content_hash: string;
        document_ciphertext: Buffer;
        document_nonce: Buffer;
        aad_hash: string;
      }[]
    >`
      select version.id, version.language, version.version, version.content_hash,
        payload.document_ciphertext, payload.document_nonce, payload.aad_hash
      from public.cv_versions version
      join private.cv_payloads payload
        on payload.cv_version_id = version.id and payload.user_id = version.user_id
      where version.user_id = ${userId} and version.language = ${language}
        and version.lifecycle = 'APPROVED'
      order by version.version desc, version.created_at desc
      limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      language: row.language,
      version: row.version,
      contentHash: row.content_hash,
      bytes: decryptBytes(
        {ciphertext: row.document_ciphertext, nonce: row.document_nonce, aadHash: row.aad_hash},
        decodeDataKey(keys[0].decrypted_secret),
        cvPayloadAad(userId, row.id),
      ),
    };
  } finally {
    await sql.end();
  }
}

async function loadKey(sql: ReturnType<typeof postgres>): Promise<Buffer> {
  const keys = await sql<{decrypted_secret: string}[]>`
    select decrypted_secret from vault.decrypted_secrets
    where name = 'opportunity_data_key_v1' limit 1
  `;
  if (!keys[0]?.decrypted_secret) throw new Error('Private CV encryption key is unavailable.');
  return decodeDataKey(keys[0].decrypted_secret);
}

export async function saveCvDraft(document: CvDraftDocument, userId: string): Promise<CvVersionMetadata> {
  const url = databaseUrl();
  if (!url) throw new Error('Private CV database is unavailable.');
  const sql = postgres(url, {max: 1, prepare: false});
  try {
    const key = await loadKey(sql);
    if (document.aiRunId) {
      const runs = await sql<
        {
          input_ciphertext: Buffer;
          input_nonce: Buffer;
          aad_hash: string;
        }[]
      >`
        select payload.input_ciphertext,payload.input_nonce,payload.aad_hash
        from public.ai_runs run
        join private.ai_payloads payload on payload.ai_run_id=run.id and payload.user_id=run.user_id
        where run.id=${document.aiRunId} and run.user_id=${userId}
          and run.purpose='CV_TAILOR' and run.status='SUCCESS'
        limit 1
      `;
      const run = runs[0];
      if (!run) throw new Error('Referenced AI run is unavailable or does not belong to this user.');
      const input = JSON.parse(
        decryptBytes(
          {ciphertext: run.input_ciphertext, nonce: run.input_nonce, aadHash: run.aad_hash.split(':')[0] ?? ''},
          key,
          aiPayloadAad(userId, document.aiRunId, 'input'),
        ).toString('utf8'),
      ) as {
        language?: unknown;
        opportunity?: {id?: unknown};
        baseCv?: {id?: unknown; bullets?: Array<{factIds?: unknown}>};
      };
      const runFactIds = new Set(
        (input.baseCv?.bullets ?? []).flatMap((bullet) =>
          Array.isArray(bullet.factIds) ? bullet.factIds.filter((id): id is string => typeof id === 'string') : [],
        ),
      );
      const bindingMatches =
        input.language === document.language.toLowerCase() &&
        input.opportunity?.id === document.opportunityId &&
        input.baseCv?.id === document.sourceCvVersionId &&
        document.sourceFactIds.every((id) => runFactIds.has(id));
      if (!bindingMatches)
        throw new Error('Referenced AI run does not match this opportunity, language, source CV, or fact set.');
    }
    return await sql.begin(async (tx) => {
      const category = `TAILORED_${document.language}`;
      await tx`select pg_advisory_xact_lock(hashtext(${`${userId}:${category}`}))`;
      const versions = await tx<{version: number}[]>`
        select coalesce(max(version), 0)::int + 1 as version
        from public.cv_versions
        where user_id = ${userId} and category = ${category}
      `;
      const version = versions[0]?.version ?? 1;
      const id = randomUUID();
      const bytes = Buffer.from(JSON.stringify(document), 'utf8');
      const contentHash = createHash('sha256').update(bytes).digest('hex');
      const encrypted = encryptBytes(bytes, key, cvPayloadAad(userId, id));
      const rows = await tx<
        {
          id: string;
          category: string;
          language: 'EN' | 'HR';
          version: number;
          lifecycle: 'DRAFT' | 'APPROVED' | 'ARCHIVED';
          content_hash: string;
          created_at: Date;
        }[]
      >`
        insert into public.cv_versions(
          id,user_id,category,version,content_hash,storage_path,language,lifecycle,
          evidence_manifest,change_summary,generated_by
        ) values(
          ${id},${userId},${category},${version},${contentHash},${`private.cv_payloads/${id}`},
          ${document.language},'DRAFT',
          ${tx.json([
            {
              source: document.aiRunId ? 'OPENAI_ASSISTED_USER_DRAFT' : 'USER_EDITED_DRAFT',
              opportunityId: document.opportunityId,
              sourceCvVersionId: document.sourceCvVersionId,
              sourceHash: document.sourceHash,
              sourceFactIds: document.sourceFactIds,
              aiRunId: document.aiRunId ?? null,
              reviewRequired: true,
            },
          ])},
          ${tx.json([{field: 'title'}, {field: 'summary'}, {field: 'factDrafts'}])},
          ${document.aiRunId ? 'OPENAI' : 'MANUAL'}
        )
        returning id,category,language,version,lifecycle,content_hash,created_at
      `;
      await tx`
        insert into private.cv_payloads(
          cv_version_id,user_id,document_ciphertext,document_nonce,aad_hash,encryption_key_version
        ) values(
          ${id},${userId},${encrypted.ciphertext},${encrypted.nonce},${encrypted.aadHash},1
        )
      `;
      const row = rows[0];
      if (!row) throw new Error('CV draft insert returned no row.');
      return {
        id: row.id,
        category: row.category,
        language: row.language,
        version: row.version,
        lifecycle: row.lifecycle,
        contentHash: row.content_hash,
        createdAt: row.created_at.toISOString(),
      };
    });
  } finally {
    await sql.end();
  }
}

export async function listCvVersions(userId: string): Promise<CvVersionMetadata[]> {
  const url = databaseUrl();
  if (!url) return [];
  const sql = postgres(url, {max: 1, prepare: false});
  try {
    const rows = await sql<
      {
        id: string;
        category: string;
        language: 'EN' | 'HR';
        version: number;
        lifecycle: 'DRAFT' | 'APPROVED' | 'ARCHIVED';
        content_hash: string;
        created_at: Date;
      }[]
    >`
      select id,category,language,version,lifecycle,content_hash,created_at
      from public.cv_versions where user_id=${userId}
      order by created_at desc, version desc
    `;
    return rows.map((row) => ({
      id: row.id,
      category: row.category,
      language: row.language,
      version: row.version,
      lifecycle: row.lifecycle,
      contentHash: row.content_hash,
      createdAt: row.created_at.toISOString(),
    }));
  } finally {
    await sql.end();
  }
}
