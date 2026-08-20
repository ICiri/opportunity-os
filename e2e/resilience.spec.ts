import {expect, test} from '@playwright/test';

test('security headers and concurrent health traffic stay healthy', async ({request}) => {
  const responses = await Promise.all(Array.from({length: 40}, () => request.get('/api/health')));
  expect(responses.every((response) => response.status() === 200)).toBe(true);
  const headers = responses[0].headers();
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['permissions-policy']).toContain('camera=()');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
});

test('concurrent read-only misses remain bounded and truthful without launching provider runs', async ({request}) => {
  const responses = await Promise.all(
    Array.from({length: 25}, (_, index) => request.get(`/api/search-runs/missing-${index}`)),
  );
  expect(responses.every((response) => response.status() === 404)).toBe(true);
  for (const response of responses) {
    expect(await response.json()).toMatchObject({error: 'RUN_NOT_FOUND'});
  }
  expect((await request.get('/api/health')).status()).toBe(200);
});
