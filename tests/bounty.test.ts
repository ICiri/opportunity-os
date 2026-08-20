import {describe, it, expect} from 'vitest';
import {assertAuthorizedScope} from '../src/lib/bounty/scope';
describe('bounty scope firewall', () => {
  it.each(['NO', 'UNKNOWN'] as const)('blocks %s scope', (scope) =>
    expect(() => assertAuthorizedScope(scope)).toThrow('BOUNTY_RESEARCH_BLOCKED'),
  );
  it('allows explicit authorization', () => expect(assertAuthorizedScope('YES')).toBe(true));
});
