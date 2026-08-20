import {NextResponse} from 'next/server';
import {getRun} from '@/lib/hunter/run-store';
export async function GET(_: Request, {params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const run = getRun(id);
  return run ? NextResponse.json(run) : NextResponse.json({error: 'RUN_NOT_FOUND'}, {status: 404});
}
