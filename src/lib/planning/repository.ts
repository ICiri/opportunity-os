import 'server-only';
import postgres from 'postgres';

export type PortfolioRow = {
  threadId: string;
  company: string;
  state: string;
  priority: number;
  nextAction: string;
  nextActionAt: string | null;
};

function databaseUrl(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.NODE_ENV !== 'production') return 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
  return null;
}

export async function loadPortfolio(userId: string): Promise<PortfolioRow[] | null> {
  const url = databaseUrl();
  if (!url) return null;
  const sql = postgres(url, {max: 1, prepare: false});
  try {
    const rows = await sql<
      {
        thread_id: string;
        company: string | null;
        lifecycle: string | null;
        priority: number | null;
        next_action: string | null;
        next_action_at: Date | null;
      }[]
    >`
      select thread.id thread_id, company.name company, thread.lifecycle, thread.priority,
        thread.next_action, thread.next_action_at
      from public.email_threads thread
      left join public.companies company on company.id = thread.company_id
      where thread.user_id = ${userId}
      order by thread.priority desc, thread.created_at desc
    `;
    return rows.map((row) => ({
      threadId: row.thread_id,
      company: row.company ?? 'Company not linked',
      state: row.lifecycle ?? 'UNKNOWN',
      priority: row.priority ?? 0,
      nextAction: row.next_action ?? 'Review the encrypted thread and record a next action.',
      nextActionAt: row.next_action_at?.toISOString() ?? null,
    }));
  } catch {
    return null;
  } finally {
    await sql.end();
  }
}
