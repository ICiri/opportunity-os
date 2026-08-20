import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

const command = process.argv[2];
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required. Load the target environment explicitly before running this command.');
  process.exit(1);
}
if (command !== 'migrate' && command !== 'seed') {
  console.error('Usage: tsx scripts/database.ts migrate|seed');
  process.exit(1);
}

const sql = postgres(url, {max: 1, prepare: false});
try {
  if (command === 'seed') {
    const file = path.resolve('supabase/seed.sql');
    await sql.unsafe(await fs.readFile(file, 'utf8'));
    console.log(JSON.stringify({status: 'PASS', command, file}, null, 2));
  } else {
    await sql.unsafe(`
      create schema if not exists supabase_migrations;
      create table if not exists supabase_migrations.schema_migrations(
        version text primary key,
        statements text[],
        name text
      );
    `);
    const directory = path.resolve('supabase/migrations');
    const files = (await fs.readdir(directory)).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
    const appliedRows = await sql<{version: string}[]>`select version from supabase_migrations.schema_migrations`;
    const applied = new Set(appliedRows.map((row) => row.version));
    const installed: string[] = [];
    for (const file of files) {
      const [version, ...nameParts] = file.replace(/\.sql$/, '').split('_');
      if (!version || applied.has(version)) continue;
      const body = await fs.readFile(path.join(directory, file), 'utf8');
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`
          insert into supabase_migrations.schema_migrations(version,statements,name)
          values(${version},${[body]},${nameParts.join('_')})
        `;
      });
      installed.push(file);
    }
    console.log(JSON.stringify({status: 'PASS', command, discovered: files.length, applied: installed}, null, 2));
  }
} finally {
  await sql.end();
}
