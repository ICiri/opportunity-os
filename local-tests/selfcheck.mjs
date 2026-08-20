import fs from 'node:fs';
import path from 'node:path';

const required = [
  'src/app/page.tsx',
  'src/app/planning/page.tsx',
  'src/lib/conversation/repository.ts',
  'src/lib/gmail/repository.ts',
  'src/lib/relationships/repository.ts',
  'src/lib/opportunities/view-model.ts',
  'src/lib/ai/repository.ts',
  'src/lib/hunter/persistence.ts',
  'src/app/api/ai/cv-tailor/route.ts',
  'src/app/api/cv-versions/route.ts',
  'supabase/migrations/202608160001_opportunity_os.sql',
  'supabase/migrations/20260816125000_truthful_source_provenance.sql',
  'supabase/migrations/20260816131000_career_fact_provenance.sql',
  'supabase/migrations/20260816133000_private_subject_and_query_indexes.sql',
  'supabase/migrations/20260816134500_job_source_run_provenance.sql',
  'docs/RUNBOOK.md',
  'README.md',
];
const forbidden = [
  'src/data/opportunities.ts',
  'src/data/conversation-records.ts',
  'src/data/recent-email-audits.ts',
  'src/data/mailbox-snapshots.ts',
];

const failures = [];
for (const file of required) if (!fs.existsSync(path.resolve(file))) failures.push(`MISSING:${file}`);
for (const file of forbidden) if (fs.existsSync(path.resolve(file))) failures.push(`RUNTIME_FIXTURE_PRESENT:${file}`);

const migration = fs.readFileSync('supabase/migrations/202608160001_opportunity_os.sql', 'utf8');
for (const table of [
  'sources',
  'source_checkpoints',
  'search_runs',
  'companies',
  'contacts',
  'email_threads',
  'conversation_audits',
  'activity_events',
]) {
  if (!migration.includes(`public.${table}`)) failures.push(`TABLE_MISSING:${table}`);
}
const explicitRls = (migration.match(/enable row level security/g) || []).length;
const loopTables = (migration.match(/foreach t in array array\[([^\]]+)/g) || [])
  .join(',')
  .split("'")
  .filter((_, index) => index % 2 === 1);
const rls = new Set(loopTables).size + explicitRls;
if (rls < 8) failures.push(`RLS_INCOMPLETE:${rls}`);

const inspectedFiles = [...walk('src'), ...walk('scripts')];
const possibleSecrets = inspectedFiles.flatMap((file) => {
  try {
    const text = fs.readFileSync(file, 'utf8');
    return /(sk-[A-Za-z0-9_-]{20,}|service_role_key\s*=\s*['"][^'"]+)/i.test(text) ? [file] : [];
  } catch {
    return [];
  }
});
if (possibleSecrets.length) failures.push(`POSSIBLE_SECRET:${possibleSecrets.join(',')}`);

console.log(
  JSON.stringify(
    {
      status: failures.length ? 'FAIL' : 'PASS',
      requiredFiles: required.length,
      forbiddenRuntimeFixtures: forbidden.length,
      rlsTables: rls,
      failures,
    },
    null,
    2,
  ),
);
process.exit(failures.length ? 1 : 0);

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(target);
    else yield target;
  }
}
