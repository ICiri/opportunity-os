import {NextResponse} from 'next/server';
import {getDatabaseHealth} from '@/lib/db/health';
export const dynamic = 'force-dynamic';
export async function GET() {
  const database = await getDatabaseHealth();
  return NextResponse.json(
    {
      status: database.status === 'CONNECTED' ? 'HEALTHY' : 'DEGRADED',
      app: 'Opportunity OS',
      database,
      checkedAt: new Date().toISOString(),
    },
    {status: database.status === 'CONNECTED' ? 200 : 503},
  );
}
