export class SourceConnectionError extends Error {
  constructor(
    message: string,
    readonly code: 'TIMEOUT' | 'HTTP_ERROR' | 'INVALID_PAYLOAD' | 'PAYLOAD_TOO_LARGE' | 'INVALID_CONFIGURATION',
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'SourceConnectionError';
  }
}

export async function fetchJson(
  url: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 12_000,
  maxBytes = 5_000_000,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: {accept: 'application/json', 'user-agent': 'Opportunity-OS-Hunter/1.0'},
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw new SourceConnectionError('Source request timed out.', 'TIMEOUT');
      throw new SourceConnectionError(error instanceof Error ? error.message : 'Source request failed.', 'HTTP_ERROR');
    }
    if (!response.ok) {
      throw new SourceConnectionError(`Source returned HTTP ${response.status}.`, 'HTTP_ERROR', response.status);
    }
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new SourceConnectionError(
        'Source payload exceeds the configured limit.',
        'PAYLOAD_TOO_LARGE',
        response.status,
      );
    }
    const body = await response.text();
    if (Buffer.byteLength(body, 'utf8') > maxBytes) {
      throw new SourceConnectionError(
        'Source payload exceeds the configured limit.',
        'PAYLOAD_TOO_LARGE',
        response.status,
      );
    }
    try {
      return {payload: JSON.parse(body) as unknown, httpStatus: response.status};
    } catch {
      throw new SourceConnectionError('Source did not return valid JSON.', 'INVALID_PAYLOAD', response.status);
    }
  } finally {
    clearTimeout(timer);
  }
}

const entities: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

export function plainText(value: string | undefined) {
  let output = value ?? '';
  for (let pass = 0; pass < 2; pass += 1) {
    output = output.replace(/&(amp|lt|gt|quot|#39|nbsp);/gi, (entity) => entities[entity.toLowerCase()] ?? entity);
  }
  return output
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function absoluteHttpsUrl(value: string) {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:') throw new SourceConnectionError('Job URL must use HTTPS.', 'INVALID_PAYLOAD');
  return parsed.toString();
}
