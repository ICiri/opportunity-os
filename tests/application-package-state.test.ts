import {describe, expect, it} from 'vitest';
import {
  applicationApprovalHash,
  applicationPackageContentHash,
  applicationPreflightHash,
  assertApplicationPackageTransition,
  canTransitionApplicationPackage,
  reconciliationFreshnessFinding,
  type FrozenApplicationPackageMaterial,
} from '../src/lib/applications/package-state';

const material: FrozenApplicationPackageMaterial = {
  canonicalOpportunityKey: 'greenhouse:example:123',
  companyCanonicalName: ' Example Company ',
  sourceSnapshotHash: 'a'.repeat(64),
  recipient: ' Hiring@Example.com ',
  recipientVerifiedAt: '2026-08-30T10:00:00.000Z',
  subject: 'Application — Senior Engineer',
  body: 'A reviewed application body.',
  cvVersionId: '10000000-0000-4000-8000-000000000001',
  cvContentHash: 'b'.repeat(64),
  attachmentFilename: 'ivan-cv.pdf',
  attachmentSha256: 'c'.repeat(64),
  attachmentByteLength: 42_000,
  roleFitHash: 'd'.repeat(64),
  roleFitOverrideId: null,
};

describe('durable application package state', () => {
  it('allows the reviewed path and blocks mutable draft rollback', () => {
    expect(canTransitionApplicationPackage('PACKAGE_DRAFT', 'REVIEW_REQUIRED')).toBe(true);
    expect(canTransitionApplicationPackage('REVIEW_REQUIRED', 'APPROVED')).toBe(true);
    expect(canTransitionApplicationPackage('APPROVED', 'PREFLIGHT_READY')).toBe(true);
    expect(canTransitionApplicationPackage('PREFLIGHT_READY', 'SENDING')).toBe(true);
    expect(canTransitionApplicationPackage('SENDING', 'SENT')).toBe(true);
    expect(canTransitionApplicationPackage('APPROVED', 'PACKAGE_DRAFT')).toBe(false);
    expect(canTransitionApplicationPackage('SENT', 'APPROVED')).toBe(false);
    expect(() => assertApplicationPackageTransition('REVIEW_REQUIRED', 'PACKAGE_DRAFT')).toThrow(
      'APPLICATION_PACKAGE_TRANSITION_INVALID:REVIEW_REQUIRED:PACKAGE_DRAFT',
    );
  });

  it('requires a fresh preflight after a failed delivery attempt', () => {
    expect(canTransitionApplicationPackage('FAILED', 'APPROVED')).toBe(true);
    expect(canTransitionApplicationPackage('FAILED', 'PREFLIGHT_READY')).toBe(false);
  });

  it('canonicalizes recipient and company but binds every frozen content change', () => {
    const hash = applicationPackageContentHash(material);
    expect(
      applicationPackageContentHash({
        ...material,
        recipient: 'hiring@example.com',
        companyCanonicalName: 'example company',
      }),
    ).toBe(hash);
    expect(applicationPackageContentHash({...material, body: `${material.body} Changed.`})).not.toBe(hash);
    expect(applicationPackageContentHash({...material, attachmentSha256: 'e'.repeat(64)})).not.toBe(hash);
    expect(applicationPackageContentHash({...material, roleFitOverrideId: crypto.randomUUID()})).not.toBe(hash);
  });

  it('binds approvals and deterministic preflights to the exact package hash', () => {
    const packageContentHash = applicationPackageContentHash(material);
    const approval = applicationApprovalHash({
      packageId: '20000000-0000-4000-8000-000000000001',
      userId: '30000000-0000-4000-8000-000000000001',
      packageContentHash,
      approvedAt: '2026-08-30T10:05:00.000Z',
    });
    expect(approval).toHaveLength(64);
    expect(
      applicationApprovalHash({
        packageId: '20000000-0000-4000-8000-000000000001',
        userId: '30000000-0000-4000-8000-000000000001',
        packageContentHash: 'f'.repeat(64),
        approvedAt: '2026-08-30T10:05:00.000Z',
      }),
    ).not.toBe(approval);

    const preflightInput = {
      packageId: '20000000-0000-4000-8000-000000000001',
      packageContentHash,
      reconciledAt: '2026-08-30T10:06:00.000Z',
    };
    expect(applicationPreflightHash({...preflightInput, findings: ['B', 'A', 'A']})).toBe(
      applicationPreflightHash({...preflightInput, findings: ['A', 'B']}),
    );
  });

  it('fails closed for stale, invalid, or materially future reconciliation evidence', () => {
    const now = new Date('2026-08-30T10:10:00.000Z');
    expect(reconciliationFreshnessFinding('2026-08-30T10:05:00.000Z', now)).toBeNull();
    expect(reconciliationFreshnessFinding('2026-08-30T09:59:59.999Z', now)).toBe('GMAIL_RECONCILIATION_STALE');
    expect(reconciliationFreshnessFinding('not-a-date', now)).toBe('GMAIL_RECONCILIATION_STALE');
    expect(reconciliationFreshnessFinding('2026-08-30T10:15:00.001Z', now)).toBe('GMAIL_RECONCILIATION_STALE');
  });
});
