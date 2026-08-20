import postgres from 'postgres';
export type DatabaseHealth = {
  status: 'CONNECTED' | 'DISCONNECTED';
  latencyMs: number;
  tables: number;
  sources: number;
  principles: number;
  conversations: number;
  error?: string;
};
export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  const started = performance.now();
  const url = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
  const sql = postgres(url, {max: 1, connect_timeout: 2, idle_timeout: 1});
  try {
    const [row] = await sql<
      {tables: number; sources: number; principles: number; conversations: number}[]
    >`select (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r') tables,(select count(*)::int from public.sources) sources,(select count(*)::int from public.principles) principles,(select count(*)::int from public.email_threads) conversations`;
    return {status: 'CONNECTED', latencyMs: Math.round(performance.now() - started), ...row};
  } catch (error) {
    return {
      status: 'DISCONNECTED',
      latencyMs: Math.round(performance.now() - started),
      tables: 0,
      sources: 0,
      principles: 0,
      conversations: 0,
      error: error instanceof Error ? error.message : 'Database unavailable',
    };
  } finally {
    await sql.end({timeout: 1});
  }
}
