import 'server-only';
import postgres from 'postgres';
import type {CvDecision} from './role-fit';

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.NODE_ENV !== 'production') return 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
  return null;
}

export type RoleFitOverride = {
  jobPostingId: string;
  analysisHash: string;
  decision: CvDecision;
  reason: string;
  createdAt: string;
};

export async function loadRoleFitOverrides(userId: string) {
  const url = databaseUrl();
  if (!url) return [];
  const sql = postgres(url, {max: 1, prepare: false});
  try {
    const rows = await sql<
      {job_posting_id: string; analysis_hash: string; decision: CvDecision; reason: string; created_at: Date}[]
    >`
      select job_posting_id,analysis_hash,decision,reason,created_at
      from public.cv_role_fit_overrides where user_id=${userId}
      order by created_at desc
    `;
    return rows.map((row) => ({
      jobPostingId: row.job_posting_id,
      analysisHash: row.analysis_hash,
      decision: row.decision,
      reason: row.reason,
      createdAt: row.created_at.toISOString(),
    }));
  } finally {
    await sql.end();
  }
}

export async function hasRoleFitOverride(userId: string, jobPostingId: string, analysisHash: string) {
  return (await loadRoleFitOverrides(userId)).some(
    (item) => item.jobPostingId === jobPostingId && item.analysisHash === analysisHash,
  );
}

export async function createRoleFitOverride(input: {
  userId: string;
  jobPostingId: string;
  analysisHash: string;
  decision: 'BORDERLINE' | 'BLOCKED_HARD_GAP';
  reason: string;
  acknowledgedGaps: string[];
}) {
  const url = databaseUrl();
  if (!url) throw new Error('Role-fit override database is unavailable.');
  const sql = postgres(url, {max: 1, prepare: false});
  try {
    const rows = await sql<{id: string; created_at: Date}[]>`
      insert into public.cv_role_fit_overrides(user_id,job_posting_id,analysis_hash,decision,reason,acknowledged_gaps)
      values(${input.userId},${input.jobPostingId},${input.analysisHash},${input.decision},${input.reason},${sql.json(input.acknowledgedGaps)})
      on conflict(user_id,job_posting_id,analysis_hash) do nothing
      returning id,created_at
    `;
    return rows[0] ? {id: rows[0].id, createdAt: rows[0].created_at.toISOString()} : null;
  } finally {
    await sql.end();
  }
}
