import 'server-only';
import postgres from 'postgres';

const LOCAL_USER_ID = process.env.OPPORTUNITY_LOCAL_USER_ID ?? '20000000-0000-4000-8000-000000000001';

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.NODE_ENV !== 'production') return 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
  return null;
}

export async function loadPreviouslyContactedCompanies() {
  const url = databaseUrl();
  if (!url) return new Set<string>();
  const sql = postgres(url, {max: 1, prepare: false});
  try {
    const rows = await sql<{canonical_name: string}[]>`
      select distinct company.canonical_name
      from public.email_threads thread
      join public.companies company on company.id=thread.company_id and company.user_id=thread.user_id
      where thread.user_id=${LOCAL_USER_ID}
        and exists(
          select 1 from public.email_messages message
          where message.thread_id=thread.id and message.direction='OUTBOUND'
        )
    `;
    return new Set(rows.map((row) => row.canonical_name));
  } finally {
    await sql.end();
  }
}
