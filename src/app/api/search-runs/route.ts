import {NextResponse} from 'next/server';
import {createRun} from '@/lib/hunter/run-store';
import {consumeSearchRunToken} from '@/lib/hunter/rate-limit';

export async function POST() {
  const limit = consumeSearchRunToken();
  if (!limit.allowed) {
    return NextResponse.json(
      {error: 'RATE_LIMITED', retryAfterSeconds: limit.retryAfterSeconds},
      {status: 429, headers: {'Retry-After': String(limit.retryAfterSeconds)}},
    );
  }
  return NextResponse.json(createRun(), {status: 202});
}
