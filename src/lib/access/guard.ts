import {NextResponse, type NextRequest} from 'next/server';

export const ACCESS_ERROR = 'AUTH_CONNECTION_REQUIRED' as const;

export type AccessContext = {
  nodeEnv: string | undefined;
  explicitTestMode: boolean;
  hostname: string;
};

export type AccessDecision =
  | {allowed: true; reason: 'LOCAL_DEVELOPMENT' | 'LOCAL_TEST'}
  | {allowed: false; reason: 'AUTH_NOT_IMPLEMENTED' | 'NON_LOOPBACK_LOCAL_ACCESS'};

export function isLoopbackHostname(hostname: string) {
  const normalized = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '::ffff:127.0.0.1'
  );
}

export function hostnameFromRequest(hostHeader: string | null, fallback: string) {
  if (!hostHeader) return fallback;
  const first = hostHeader.split(',')[0]?.trim();
  if (!first) return '';
  try {
    return new URL(`http://${first}`).hostname;
  } catch {
    return '';
  }
}

export function resolveAccess({nodeEnv, explicitTestMode, hostname}: AccessContext): AccessDecision {
  const loopback = isLoopbackHostname(hostname);
  const development = nodeEnv === 'development';
  const test = nodeEnv === 'test' || explicitTestMode;
  if (loopback && development) return {allowed: true, reason: 'LOCAL_DEVELOPMENT'};
  if (loopback && test) return {allowed: true, reason: 'LOCAL_TEST'};
  if ((development || test) && !loopback) return {allowed: false, reason: 'NON_LOOPBACK_LOCAL_ACCESS'};
  return {allowed: false, reason: 'AUTH_NOT_IMPLEMENTED'};
}

const responseHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Opportunity-OS-Access': 'blocked-auth-required',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
} as const;

export function connectionRequiredResponse(request: Pick<NextRequest, 'nextUrl'>) {
  const isApi = request.nextUrl.pathname === '/api' || request.nextUrl.pathname.startsWith('/api/');
  if (isApi) {
    return NextResponse.json(
      {
        error: ACCESS_ERROR,
        message: 'Production access is disabled until a real authenticated connection is implemented.',
        action: 'Connect and verify application authentication before enabling remote access.',
      },
      {status: 503, headers: responseHeaders},
    );
  }
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connection required | Opportunity OS</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#171b1d;color:#e8ecea;font-family:system-ui,sans-serif"><main style="width:min(42rem,calc(100% - 2rem));padding:2rem;border:1px solid #394143;border-radius:1rem;background:#202628"><p style="color:#91b9aa;text-transform:uppercase;letter-spacing:.12em;font-size:.75rem">Opportunity OS · fail-closed</p><h1>Authenticated connection required</h1><p style="line-height:1.6;color:#bdc8c4">Production access is disabled until a real authenticated application connection is implemented and verified. No local or test session is treated as production authentication.</p><code style="display:inline-block;margin-top:1rem;padding:.5rem .7rem;border-radius:.4rem;background:#15191a;color:#b8dbc9">AUTH_CONNECTION_REQUIRED</code></main></body></html>';
  return new NextResponse(html, {
    status: 503,
    headers: {...responseHeaders, 'Content-Type': 'text/html; charset=utf-8'},
  });
}
