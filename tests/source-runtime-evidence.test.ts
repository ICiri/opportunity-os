import {describe, expect, it} from 'vitest';
import {runtimeSourceState} from '../src/lib/hunter/persistence';

describe('persisted runtime source evidence', () => {
  const now = new Date('2026-08-30T12:00:00.000Z');

  it('only reports LIVE for a current successful response', () => {
    expect(runtimeSourceState('LIVE', '2026-08-30T11:00:00.000Z', 200, now)).toBe('LIVE');
    expect(runtimeSourceState('LIVE', '2026-08-30T11:00:00.000Z', 503, now)).toBe('DEGRADED');
  });

  it('degrades expired live evidence to STALE', () => {
    expect(runtimeSourceState('LIVE', '2026-08-29T08:00:00.000Z', 200, now)).toBe('STALE');
  });

  it('preserves research and disconnected states without inferring liveness', () => {
    expect(runtimeSourceState('RESEARCH', null, null, now)).toBe('RESEARCH');
    expect(runtimeSourceState('DISCONNECTED', '2026-08-30T11:00:00.000Z', 200, now)).toBe('DISCONNECTED');
  });
});
