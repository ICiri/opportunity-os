import fs from 'node:fs';
import {NextRequest} from 'next/server';
import {describe, expect, it} from 'vitest';
import {
  ACCESS_ERROR,
  connectionRequiredResponse,
  hostnameFromRequest,
  isLoopbackHostname,
  resolveAccess,
} from '../src/lib/access/guard';

describe('bounded application access', () => {
  it.each(['localhost', '127.0.0.1', '::1', '[::1]', '::ffff:127.0.0.1'])('recognizes loopback host %s', (hostname) =>
    expect(isLoopbackHostname(hostname)).toBe(true),
  );

  it('derives the effective hostname from the request Host header', () => {
    expect(hostnameFromRequest('127.0.0.1:3000', 'ignored.example')).toBe('127.0.0.1');
    expect(hostnameFromRequest('[::1]:3000', 'ignored.example')).toBe('[::1]');
    expect(hostnameFromRequest('opportunity.example', 'ignored.example')).toBe('opportunity.example');
  });

  it('allows anonymous development only on loopback', () => {
    expect(resolveAccess({nodeEnv: 'development', explicitTestMode: false, hostname: '127.0.0.1'})).toEqual({
      allowed: true,
      reason: 'LOCAL_DEVELOPMENT',
    });
    expect(resolveAccess({nodeEnv: 'development', explicitTestMode: false, hostname: 'opportunity.example'})).toEqual({
      allowed: false,
      reason: 'NON_LOOPBACK_LOCAL_ACCESS',
    });
  });

  it('allows the explicit test harness only on loopback', () => {
    expect(resolveAccess({nodeEnv: 'production', explicitTestMode: true, hostname: 'localhost'})).toEqual({
      allowed: true,
      reason: 'LOCAL_TEST',
    });
    expect(resolveAccess({nodeEnv: 'production', explicitTestMode: true, hostname: 'opportunity.example'})).toEqual({
      allowed: false,
      reason: 'NON_LOOPBACK_LOCAL_ACCESS',
    });
  });

  it('fails closed in production without inventing an authenticated session', () => {
    expect(resolveAccess({nodeEnv: 'production', explicitTestMode: false, hostname: '127.0.0.1'})).toEqual({
      allowed: false,
      reason: 'AUTH_NOT_IMPLEMENTED',
    });
    expect(resolveAccess({nodeEnv: 'production', explicitTestMode: false, hostname: 'opportunity.example'})).toEqual({
      allowed: false,
      reason: 'AUTH_NOT_IMPLEMENTED',
    });
    const proxySource = fs.readFileSync('src/proxy.ts', 'utf8');
    expect(proxySource).not.toMatch(/cookie|bearer|authorization|supabase/i);
  });

  it('returns a clear 503 JSON contract for APIs', async () => {
    const response = connectionRequiredResponse(new NextRequest('https://opportunity.example/api/health'));
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('x-opportunity-os-access')).toBe('blocked-auth-required');
    await expect(response.json()).resolves.toMatchObject({error: ACCESS_ERROR});
  });

  it('returns a clear 503 HTML response for private pages', async () => {
    const response = connectionRequiredResponse(new NextRequest('https://opportunity.example/conversations'));
    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('Authenticated connection required');
  });
});
