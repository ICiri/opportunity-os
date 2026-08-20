import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {createRun} from '../../../../../lib/hunter/run-store';
import {zagrebScheduleDecision} from '../../../../../lib/hunter/schedule';
import {findPersistedScheduledRun} from '../../../../../lib/hunter/persistence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validSecret(received: string | null, expected: string) {
  if (!received?.startsWith('Bearer ')) return false;
  const candidate = Buffer.from(received.slice('Bearer '.length));
  const configured = Buffer.from(expected);
  return candidate.length === configured.length && timingSafeEqual(candidate, configured);
}

export async function POST(request: Request) {
  const secret = process.env.HUNTER_CRON_SECRET;
  if (!secret || secret.length < 32) {
    return NextResponse.json({error: 'SCHEDULER_NOT_CONFIGURED'}, {status: 503});
  }
  if (!validSecret(request.headers.get('authorization'), secret)) {
    return NextResponse.json({error: 'UNAUTHORIZED'}, {status: 401});
  }
  const scheduledHeader = request.headers.get('x-opportunity-scheduled-at');
  const scheduledAt = scheduledHeader ? new Date(scheduledHeader) : new Date(Number.NaN);
  if (!Number.isFinite(scheduledAt.getTime())) {
    return NextResponse.json({error: 'INVALID_SCHEDULED_AT'}, {status: 400});
  }
  if (Math.abs(Date.now() - scheduledAt.getTime()) > 15 * 60_000) {
    return NextResponse.json({error: 'STALE_SCHEDULED_AT'}, {status: 401});
  }
  const decision = zagrebScheduleDecision(scheduledAt);
  if (!decision.due) {
    return NextResponse.json({status: 'SKIPPED_NOT_DUE', ...decision}, {status: 200});
  }
  const persisted =
    process.env.OPPORTUNITY_OS_TEST_MODE === '1'
      ? null
      : await findPersistedScheduledRun(decision.idempotencyKey).catch(() => null);
  if (persisted) return NextResponse.json({run: persisted, schedule: decision, idempotent: true}, {status: 200});
  const run = createRun({
    triggerType: 'SCHEDULED',
    idempotencyKey: decision.idempotencyKey,
    now: scheduledAt,
  });
  return NextResponse.json({run, schedule: decision}, {status: 202});
}
