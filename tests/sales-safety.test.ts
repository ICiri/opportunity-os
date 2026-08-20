import {describe, it, expect} from 'vitest';
import {auditOutreach} from '../src/lib/planning/sales-safety';
const safe = {
  recipientVerified: true,
  legitimateRelevance: true,
  personalizedEvidence: true,
  optedOut: false,
  previousTouches: 0,
  daysSinceLastTouch: 30,
  claimsVerified: true,
  humanApproved: true,
};
describe('professional outreach firewall', () => {
  it('allows a verified, relevant, approved message', () => expect(auditOutreach(safe).allowed).toBe(true));
  it('blocks opt-outs and unverified recipients', () => {
    const result = auditOutreach({...safe, optedOut: true, recipientVerified: false});
    expect(result.allowed).toBe(false);
    expect(result.blocks).toEqual(expect.arrayContaining(['OPTED_OUT', 'RECIPIENT_UNVERIFIED']));
  });
  it('blocks rapid repeated follow-ups', () =>
    expect(auditOutreach({...safe, previousTouches: 2, daysSinceLastTouch: 4}).blocks).toContain(
      'FOLLOWUP_FREQUENCY_LIMIT',
    ));
  it('always requires human approval', () =>
    expect(auditOutreach({...safe, humanApproved: false}).blocks).toContain('HUMAN_APPROVAL_REQUIRED'));
});
