import {NextResponse, type NextRequest} from 'next/server';
import {connectionRequiredResponse, hostnameFromRequest, resolveAccess} from '@/lib/access/guard';

export function proxy(request: NextRequest) {
  const decision = resolveAccess({
    nodeEnv: process.env.NODE_ENV,
    explicitTestMode: process.env.OPPORTUNITY_OS_TEST_MODE === '1',
    hostname: hostnameFromRequest(request.headers.get('host'), request.nextUrl.hostname),
  });
  if (!decision.allowed) return connectionRequiredResponse(request);
  const response = NextResponse.next();
  response.headers.set(
    'X-Opportunity-OS-Access',
    decision.reason === 'LOCAL_TEST' ? 'local-test' : 'local-development',
  );
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)'],
};
