import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {z} from 'zod';

const USER_ID = process.env.OPPORTUNITY_LOCAL_USER_ID ?? '20000000-0000-4000-8000-000000000001';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
const manifestPath = process.env.OPPORTUNITY_CAREER_FACTS_PATH;

const languageSchema = z.enum(['EN', 'HR']);
const categorySchema = z.enum(['HEADLINE', 'SUMMARY', 'EXPERIENCE', 'SKILL', 'EDUCATION', 'CONTACT']);
const manifestSchema = z.object({
  sources: z.object({
    EN: z.object({path: z.string().min(1), hash: z.string().regex(/^[0-9a-f]{64}$/)}),
    HR: z.object({path: z.string().min(1), hash: z.string().regex(/^[0-9a-f]{64}$/)}),
  }),
  facts: z
    .array(
      z.object({
        id: z.string().uuid(),
        language: languageSchema,
        category: categorySchema,
        statement: z.string().trim().min(1).max(4_000),
        locator: z.string().trim().min(1).max(500),
      }),
    )
    .min(1),
});

async function main() {
  if (!manifestPath)
    throw new Error('OPPORTUNITY_CAREER_FACTS_PATH is required. Keep the reviewed manifest outside source control.');
  const manifest = manifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')));
  for (const language of languageSchema.options) {
    const source = manifest.sources[language];
    const actual = createHash('sha256')
      .update(await readFile(source.path))
      .digest('hex');
    if (actual !== source.hash) throw new Error(`${language}_SOURCE_CV_HASH_MISMATCH:${actual}`);
    const categories = new Set(
      manifest.facts.filter((fact) => fact.language === language).map((fact) => fact.category),
    );
    for (const required of ['HEADLINE', 'SUMMARY', 'EXPERIENCE', 'SKILL', 'CONTACT'] as const) {
      if (!categories.has(required)) throw new Error(`${language}_MISSING_REQUIRED_CATEGORY:${required}`);
    }
  }

  const sql = postgres(DATABASE_URL, {max: 1, prepare: false});
  try {
    const approved = await sql<{id: string; language: 'EN' | 'HR'; content_hash: string}[]>`
      select id,language,content_hash from public.cv_versions
      where user_id=${USER_ID} and lifecycle='APPROVED' and language in ('EN','HR')
    `;
    const versions = new Map(approved.map((row) => [row.language, row]));
    for (const language of languageSchema.options) {
      if (versions.get(language)?.content_hash !== manifest.sources[language].hash)
        throw new Error(`${language}_APPROVED_CV_HASH_MISMATCH`);
    }

    await sql.begin(async (tx) => {
      for (const fact of manifest.facts) {
        const source = manifest.sources[fact.language];
        const version = versions.get(fact.language)!;
        await tx`
          insert into public.career_facts(
            id,user_id,fact,evidence,verified,language,category,source_cv_version_id,
            source_hash,source_locator,verification_method,verified_at
          ) values(
            ${fact.id},${USER_ID},${fact.statement},
            ${`${fact.language} approved CV · ${fact.locator} · SHA-256 ${source.hash}`},true,
            ${fact.language},${fact.category},${version.id},${source.hash},${fact.locator},
            'PDF_SHA256_MANUAL_TRANSCRIPTION',now()
          )
          on conflict(id) do update set
            fact=excluded.fact,evidence=excluded.evidence,verified=true,language=excluded.language,
            category=excluded.category,source_cv_version_id=excluded.source_cv_version_id,
            source_hash=excluded.source_hash,source_locator=excluded.source_locator,
            verification_method=excluded.verification_method,verified_at=excluded.verified_at
        `;
      }
    });
    console.log(
      JSON.stringify(
        {status: 'PASS', factsImported: manifest.facts.length, verificationMethod: 'PDF_SHA256_MANUAL_TRANSCRIPTION'},
        null,
        2,
      ),
    );
  } finally {
    await sql.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
