import 'server-only';
import postgres from 'postgres';

export type CommunicationMetrics = {
  trackedThreads: number;
  noRecordedFailureThreads: number;
  inboundThreads: number;
  positivePathThreads: number;
  referredThreads: number;
  interviews: number;
  experiments: number;
  experimentOutcomes: number;
};

function databaseUrl(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.NODE_ENV !== 'production') return 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
  return null;
}

export async function loadCommunicationMetrics(userId: string): Promise<CommunicationMetrics | null> {
  const url = databaseUrl();
  if (!url) return null;
  const sql = postgres(url, {max: 1, prepare: false});
  try {
    const rows = await sql<CommunicationMetrics[]>`
      select
        count(*)::int as "trackedThreads",
        count(*) filter (where lifecycle <> 'DELIVERY_FAILURE')::int as "noRecordedFailureThreads",
        count(*) filter (
          where lifecycle <> 'DELIVERY_FAILURE' and exists (
            select 1 from public.email_messages message
            where message.user_id=public.email_threads.user_id
              and message.thread_id=public.email_threads.id
              and message.direction='INBOUND'
          )
        )::int as "inboundThreads",
        count(*) filter (where lifecycle in ('REFERRED','WARM_RELATIONSHIP','REACTIVATE'))::int as "positivePathThreads",
        count(*) filter (where lifecycle = 'REFERRED')::int as "referredThreads",
        (select count(*)::int from public.interviews item where item.user_id = ${userId}) as interviews,
        (select count(*)::int from public.message_experiments item where item.user_id = ${userId}) as experiments,
        (select count(*)::int
          from public.message_experiment_outcomes outcome
          join public.message_experiments experiment on experiment.id = outcome.experiment_id
          where experiment.user_id = ${userId}) as "experimentOutcomes"
      from public.email_threads
      where user_id = ${userId}
    `;
    return rows[0] ?? null;
  } catch {
    return null;
  } finally {
    await sql.end();
  }
}
