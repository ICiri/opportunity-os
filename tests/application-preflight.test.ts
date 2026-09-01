import {describe, expect, it} from 'vitest';
import {auditApplicationBatch, type OutboundApplication} from '../src/lib/email/application-preflight';

const valid: OutboundApplication = {
  canonicalJobKey: 'workable:A8BDD3558F',
  company: 'Codurance',
  recipient: 'hello@codurance.com',
  recipientVerified: true,
  subject: 'Application — Senior Engineer',
  attachmentSha256: 'a'.repeat(64),
  body: 'Hello Codurance team,\n\nYour work on modernising business-critical platforms is relevant to my verified .NET and banking integration experience. I am available for a fractional B2B engagement from Croatia. What scope would be most useful in the first month?\n\nBest regards,\nIvan',
};

describe('application delivery preflight', () => {
  it('allows one verified and non-duplicate package', () => {
    expect(auditApplicationBatch([valid], [])).toEqual({allowed: true, findings: []});
  });
  it('blocks an already contacted job and company recipient', () => {
    const result = auditApplicationBatch(
      [valid],
      [{canonicalJobKey: valid.canonicalJobKey, company: valid.company, recipient: valid.recipient}],
    );
    expect(result.allowed).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('DUPLICATE_JOB'),
        expect.stringContaining('DUPLICATE_COMPANY_RECIPIENT'),
      ]),
    );
  });
  it('blocks technical correction copy and unverified attachments', () => {
    const result = auditApplicationBatch(
      [
        {
          ...valid,
          body: 'The attachment was incomplete. It is 137,843 bytes; disregard the smaller attachment.',
          attachmentSha256: '',
        },
      ],
      [],
    );
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('TECHNICAL_OR_ROBOTIC_COPY'),
        expect.stringContaining('ATTACHMENT_NOT_VERIFIED'),
      ]),
    );
  });
});
