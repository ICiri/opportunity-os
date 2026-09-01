import {describe, expect, it} from 'vitest';
import {sourceCatalog, sourceCatalogSummary} from '../src/data/source-catalog';

describe('master opportunity source catalog', () => {
  it('contains the requested broad market registry without overstating live connections', () => {
    expect(sourceCatalog.length).toBeGreaterThan(150);
    expect(sourceCatalogSummary.ADAPTER_IMPLEMENTED).toBe(4);
    expect(
      sourceCatalog.filter((source) => source.state === 'ADAPTER_IMPLEMENTED').map((source) => source.name),
    ).toEqual(['Greenhouse', 'Lever', 'Ashby', 'SmartRecruiters']);
    expect(sourceCatalog.find((source) => source.name === 'Workable')?.state).toBe('NEEDS_API_KEY');
  });

  it('covers the highest-priority ATS, contract and regional sources', () => {
    const names = new Set(sourceCatalog.map((source) => source.name));
    ['Workable', 'Workday', 'Teamtailor', 'Upwork', 'Malt', 'EURES', 'Job Bank Canada', 'SEEK Australia'].forEach(
      (name) => expect(names.has(name)).toBe(true),
    );
  });
});
