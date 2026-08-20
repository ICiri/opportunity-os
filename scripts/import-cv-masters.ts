import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {cvPayloadAad, decodeDataKey, encryptBytes} from '../src/lib/security/envelope';

const USER_ID = process.env.OPPORTUNITY_LOCAL_USER_ID ?? '20000000-0000-4000-8000-000000000001';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index] ?? '', process.argv[index + 1] ?? '');
}
const sources = [
  {id: '30000000-0000-4000-8000-000000000001', language: 'EN' as const, category: 'MASTER_EN', path: args.get('--en')},
  {id: '30000000-0000-4000-8000-000000000002', language: 'HR' as const, category: 'MASTER_HR', path: args.get('--hr')},
];

async function main() {
  if (sources.some((source) => !source.path))
    throw new Error('Usage: tsx scripts/import-cv-masters.ts --en <english.pdf> --hr <croatian.pdf>');
  const sql = postgres(DATABASE_URL, {max: 1, prepare: false});
  try {
    const secrets = await sql<{decrypted_secret: string}[]>`
      select decrypted_secret from vault.decrypted_secrets
      where name = 'opportunity_data_key_v1' limit 1
    `;
    if (!secrets[0]?.decrypted_secret) throw new Error('Vault data key is missing.');
    const key = decodeDataKey(secrets[0].decrypted_secret);
    const results: {language: string; bytes: number; sha256: string}[] = [];
    await sql.begin(async (tx) => {
      for (const source of sources) {
        const bytes = await readFile(source.path!);
        if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-')))
          throw new Error(`${source.language} source is not a PDF.`);
        const hash = createHash('sha256').update(bytes).digest('hex');
        const encrypted = encryptBytes(bytes, key, cvPayloadAad(USER_ID, source.id));
        await tx`
          insert into public.cv_versions(
            id,user_id,category,version,content_hash,storage_path,language,lifecycle,
            evidence_manifest,change_summary,generated_by,approved_at
          ) values(
            ${source.id},${USER_ID},${source.category},1,${hash},${`private.cv_payloads/${source.id}`},
            ${source.language},'APPROVED',${tx.json([{source: 'USER_SUPPLIED_PDF', sha256: hash}])},
            '[]'::jsonb,'MANUAL',now()
          ) on conflict(id) do update set
            content_hash=excluded.content_hash,storage_path=excluded.storage_path,
            evidence_manifest=excluded.evidence_manifest,approved_at=excluded.approved_at
        `;
        await tx`
          insert into private.cv_payloads(
            cv_version_id,user_id,document_ciphertext,document_nonce,aad_hash,encryption_key_version
          ) values(
            ${source.id},${USER_ID},${encrypted.ciphertext},${encrypted.nonce},${encrypted.aadHash},1
          ) on conflict(cv_version_id) do update set
            user_id=excluded.user_id,document_ciphertext=excluded.document_ciphertext,
            document_nonce=excluded.document_nonce,aad_hash=excluded.aad_hash,
            encryption_key_version=excluded.encryption_key_version
        `;
        results.push({language: source.language, bytes: bytes.length, sha256: hash});
      }
    });
    console.log(JSON.stringify({status: 'PASS', source: 'USER_SUPPLIED_PDF', versions: results}, null, 2));
  } finally {
    await sql.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
