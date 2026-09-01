import {createHash} from 'node:crypto';

export const APPLICATION_PACKAGE_STATES = [
  'DISCOVERED',
  'QUALIFIED',
  'PACKAGE_DRAFT',
  'REVIEW_REQUIRED',
  'APPROVED',
  'PREFLIGHT_READY',
  'SENDING',
  'SENT',
  'FAILED',
  'CANCELLED',
] as const;

export type ApplicationPackageState = (typeof APPLICATION_PACKAGE_STATES)[number];

const TRANSITIONS: Record<ApplicationPackageState, readonly ApplicationPackageState[]> = {
  DISCOVERED: ['QUALIFIED', 'CANCELLED'],
  QUALIFIED: ['PACKAGE_DRAFT', 'CANCELLED'],
  PACKAGE_DRAFT: ['REVIEW_REQUIRED', 'CANCELLED'],
  REVIEW_REQUIRED: ['APPROVED', 'CANCELLED'],
  APPROVED: ['PREFLIGHT_READY', 'CANCELLED'],
  PREFLIGHT_READY: ['APPROVED', 'SENDING', 'CANCELLED'],
  SENDING: ['SENT', 'FAILED'],
  SENT: [],
  FAILED: ['APPROVED', 'CANCELLED'],
  CANCELLED: [],
};

export function canTransitionApplicationPackage(from: ApplicationPackageState, to: ApplicationPackageState) {
  return TRANSITIONS[from].includes(to);
}

export function assertApplicationPackageTransition(from: ApplicationPackageState, to: ApplicationPackageState) {
  if (!canTransitionApplicationPackage(from, to))
    throw new Error(`APPLICATION_PACKAGE_TRANSITION_INVALID:${from}:${to}`);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(',')}}`;
}

function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

export function sha256Text(value: string) {
  return sha256(value);
}

export type FrozenApplicationPackageMaterial = {
  canonicalOpportunityKey: string;
  companyCanonicalName: string;
  sourceSnapshotHash: string;
  recipient: string;
  recipientVerifiedAt: string;
  subject: string;
  body: string;
  cvVersionId: string;
  cvContentHash: string;
  attachmentFilename: string;
  attachmentSha256: string;
  attachmentByteLength: number;
  roleFitHash: string;
  roleFitOverrideId: string | null;
};

export function applicationPackageContentHash(material: FrozenApplicationPackageMaterial) {
  return sha256(
    canonicalJson({
      ...material,
      recipient: material.recipient.trim().toLowerCase(),
      companyCanonicalName: material.companyCanonicalName.trim().toLowerCase(),
    }),
  );
}

export function applicationApprovalHash(input: {
  packageId: string;
  userId: string;
  packageContentHash: string;
  approvedAt: string;
}) {
  return sha256(canonicalJson({...input, decision: 'APPROVED'}));
}

export function applicationPreflightHash(input: {
  packageId: string;
  packageContentHash: string;
  reconciledAt: string;
  findings: readonly string[];
}) {
  return sha256(canonicalJson({...input, findings: [...new Set(input.findings)].sort()}));
}

export const APPLICATION_RECONCILIATION_MAX_AGE_MS = 10 * 60_000;

export function reconciliationFreshnessFinding(reconciledAt: string, now = new Date()): string | null {
  const checkedAt = new Date(reconciledAt).getTime();
  const age = now.getTime() - checkedAt;
  if (!Number.isFinite(age) || age < -5 * 60_000 || age > APPLICATION_RECONCILIATION_MAX_AGE_MS) {
    return 'GMAIL_RECONCILIATION_STALE';
  }
  return null;
}
