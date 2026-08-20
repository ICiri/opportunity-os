import {describe, it, expect} from 'vitest';
import {overlapSince, canAdvanceCheckpoint} from '../src/lib/hunter/checkpoint';
describe('checkpoint safety', () => {
  it('uses overlap', () =>
    expect(overlapSince({lastSuccessAt: '2026-08-16T10:00:00.000Z'})).toBe('2026-08-16T09:50:00.000Z'));
  it('does not advance before audit', () => expect(canAdvanceCheckpoint(true, false)).toBe(false));
});
