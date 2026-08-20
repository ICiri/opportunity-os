import 'server-only';
import {randomUUID} from 'node:crypto';
import postgres from 'postgres';
import type {CvTailoringInput, VerifiedCareerFact} from './schemas';
import type {CvTailoringResult} from './contracts';
import {aiPayloadAad, decodeDataKey, encryptBytes} from '../security/envelope';

export type StoredCareerFact = VerifiedCareerFact & {
  language: 'EN' | 'HR';
  category: 'HEADLINE' | 'SUMMARY' | 'EXPERIENCE' | 'SKILL' | 'EDUCATION' | 'CONTACT';
  sourceCvVersionId: string;
  sourceHash: string;
  sourceLocator: string;
  verificationMethod: string;
};

function databaseUrl(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.NODE_ENV !== 'production') return 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
  return null;
}

export async function loadVerifiedCareerFacts(userId: string, language: 'EN' | 'HR'): Promise<StoredCareerFact[]> {
  const url = databaseUrl();
  if (!url) return [];
  const sql = postgres(url, {max: 1, prepare: false});
  try {
    const rows = await sql<
      {
        id: string;
        fact: string;
        evidence: string | null;
        language: 'EN' | 'HR';
        category: StoredCareerFact['category'];
        source_cv_version_id: string;
        source_hash: string;
        source_locator: string;
        verification_method: string;
      }[]
    >`
      select fact.id,fact.fact,fact.evidence,fact.language,fact.category,fact.source_cv_version_id,
        fact.source_hash,fact.source_locator,fact.verification_method
      from public.career_facts fact
      join public.cv_versions version
        on version.id=fact.source_cv_version_id and version.user_id=fact.user_id
        and version.lifecycle='APPROVED' and version.language=fact.language
        and version.content_hash=fact.source_hash
      where fact.user_id=${userId} and fact.verified=true and fact.language=${language}
        and fact.source_cv_version_id is not null and fact.source_hash is not null
        and fact.source_locator is not null and fact.verification_method is not null
      order by case fact.category when 'HEADLINE' then 0 when 'SUMMARY' then 1 when 'CONTACT' then 2 when 'SKILL' then 3 else 4 end,fact.id
    `;
    return rows.map((row) => ({
      id: row.id,
      statement: row.fact,
      evidence: row.evidence ?? 'Verified career fact',
      verified: true as const,
      language: row.language,
      category: row.category,
      sourceCvVersionId: row.source_cv_version_id,
      sourceHash: row.source_hash,
      sourceLocator: row.source_locator,
      verificationMethod: row.verification_method,
    }));
  } finally {
    await sql.end();
  }
}

export async function recordSuccessfulCvAiRun(
  userId: string,
  input: CvTailoringInput,
  result: CvTailoringResult,
  latencyMs: number,
): Promise<string> {
  const url = databaseUrl();
  if (!url) throw new Error('AI audit database is unavailable.');
  const sql = postgres(url, {max: 1, prepare: false});
  try {
    const secrets = await sql<{decrypted_secret: string}[]>`
      select decrypted_secret from vault.decrypted_secrets
      where name='opportunity_data_key_v1' limit 1
    `;
    if (!secrets[0]?.decrypted_secret) throw new Error('AI payload encryption key is unavailable.');
    const key = decodeDataKey(secrets[0].decrypted_secret);
    const runId = randomUUID();
    const inputEncrypted = encryptBytes(
      Buffer.from(JSON.stringify(input), 'utf8'),
      key,
      aiPayloadAad(userId, runId, 'input'),
    );
    const outputEncrypted = encryptBytes(
      Buffer.from(JSON.stringify(result.draft), 'utf8'),
      key,
      aiPayloadAad(userId, runId, 'output'),
    );
    await sql.begin(async (tx) => {
      await tx`
        insert into public.ai_runs(
          id,user_id,purpose,provider,model,prompt_version,status,input_hash,output_hash,
          input_tokens,output_tokens,latency_ms,created_at,finished_at
        ) values(
          ${runId},${userId},'CV_TAILOR',${result.audit.provider},${result.audit.modelResolved},
          ${result.audit.promptVersion},'SUCCESS',${result.audit.inputHash},${result.audit.outputHash},
          ${result.audit.usage?.inputTokens ?? null},${result.audit.usage?.outputTokens ?? null},
          ${Math.max(0, Math.round(latencyMs))},now(),now()
        )
      `;
      await tx`
        insert into private.ai_payloads(
          ai_run_id,user_id,input_ciphertext,input_nonce,output_ciphertext,output_nonce,
          aad_hash,encryption_key_version
        ) values(
          ${runId},${userId},${inputEncrypted.ciphertext},${inputEncrypted.nonce},
          ${outputEncrypted.ciphertext},${outputEncrypted.nonce},
          ${`${inputEncrypted.aadHash}:${outputEncrypted.aadHash}`},1
        )
      `;
    });
    return runId;
  } finally {
    await sql.end();
  }
}
