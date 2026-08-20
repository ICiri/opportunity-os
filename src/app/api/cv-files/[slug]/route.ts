import {getStoredCvPdf} from '@/lib/cv/repository';

const files = {
  english: {language: 'EN' as const, name: 'Candidate-CV-English.pdf'},
  croatian: {language: 'HR' as const, name: 'Candidate-CV-Croatian.pdf'},
};
const LOCAL_USER_ID = process.env.OPPORTUNITY_LOCAL_USER_ID ?? '20000000-0000-4000-8000-000000000001';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, {params}: {params: Promise<{slug: string}>}) {
  const {slug} = await params;
  const file = files[slug as keyof typeof files];
  if (!file) return Response.json({error: 'CV version not found'}, {status: 404});
  try {
    const cv = await getStoredCvPdf(file.language, LOCAL_USER_ID);
    if (!cv) return Response.json({error: 'No approved private CV version is stored.'}, {status: 404});
    return new Response(new Uint8Array(cv.bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${file.name}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        ETag: `"sha256-${cv.contentHash}"`,
      },
    });
  } catch {
    return Response.json({error: 'The encrypted CV store is unavailable.'}, {status: 503});
  }
}
