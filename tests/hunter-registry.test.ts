import {describe, expect, it} from 'vitest';
import {getSourceRegistry} from '../src/lib/hunter/registry';

describe('source registry', () => {
  it('reports provider adapters disconnected when tenant configuration is absent', () => {
    const registry = getSourceRegistry({});
    expect(
      registry
        .filter((source) => source.provider && source.access === 'OFFICIAL_PUBLIC_API')
        .every((source) => source.status === 'DISCONNECTED'),
    ).toBe(true);
    expect(registry.find((source) => source.provider === 'WORKABLE')).toMatchObject({
      status: 'RESEARCH',
      access: 'RESEARCH_ONLY',
    });
    expect(registry.some((source) => source.status === 'RESEARCH')).toBe(true);
    expect(registry.some((source) => source.status === 'LIVE')).toBe(false);
  });

  it('accepts validated tenant configuration but does not claim LIVE before a check', () => {
    const registry = getSourceRegistry({
      HUNTER_GREENHOUSE_SOURCES: JSON.stringify([
        {id: 'pagos-gh', name: 'Pagos', company: 'Pagos', boardToken: 'pagos', markets: ['EU']},
      ]),
      HUNTER_LEVER_SOURCES: JSON.stringify([
        {id: 'atlas-lever', name: 'Atlas', company: 'Atlas', site: 'atlas', region: 'EU', markets: ['EU']},
      ]),
    });
    expect(registry.filter((source) => source.configured)).toHaveLength(2);
    expect(registry.filter((source) => source.configured).every((source) => source.status === 'DISCONNECTED')).toBe(
      true,
    );
    expect(registry.find((source) => source.id === 'atlas-lever')?.endpoint).toContain('api.eu.lever.co');
  });

  it('keeps Workable research-only until documented authenticated access exists', () => {
    const registry = getSourceRegistry({
      HUNTER_WORKABLE_SOURCES: JSON.stringify([
        {id: 'acme-workable', name: 'Acme', company: 'Acme', subdomain: 'acme', markets: ['EU']},
      ]),
    });
    const workable = registry.find((source) => source.id === 'acme-workable');
    expect(workable).toMatchObject({
      configured: true,
      status: 'RESEARCH',
      access: 'RESEARCH_ONLY',
    });
    expect(workable).not.toHaveProperty('endpoint');
  });

  it('rejects malformed environment JSON without executing a fallback source', () => {
    const registry = getSourceRegistry({HUNTER_GREENHOUSE_SOURCES: '{broken'});
    const greenhouse = registry.find((source) => source.id === 'greenhouse-configuration');
    expect(greenhouse).toMatchObject({configured: false, status: 'DISCONNECTED'});
    expect(greenhouse?.note).toContain('rejected');
  });
});
