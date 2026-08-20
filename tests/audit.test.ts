import {describe, it, expect} from 'vitest';
import {classifyLifecycle, auditIntegrity} from '../src/lib/audit/conversation';
describe('conversation audit', () => {
  it('delivery failure overrides no reply', () =>
    expect(classifyLifecycle({deliveryFailure: true})).toBe('DELIVERY_FAILURE'));
  it('referral is preserved', () => expect(classifyLifecycle({inboundReply: true, referral: true})).toBe('REFERRED'));
  it('requires next action', () =>
    expect(auditIntegrity({lifecycle: 'WAITING'})).toContain('ACTIVE_CONVERSATION_WITHOUT_NEXT_ACTION'));
});
