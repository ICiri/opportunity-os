import 'server-only';
import {randomUUID} from 'node:crypto';
import postgres from 'postgres';
import {auditApplicationBatch, type OutboundApplication} from '../email/application-preflight';
import {verifyPdfAttachment} from '../email/attachment-safety';
import {
  applicationPackagePayloadAad,
  decodeDataKey,
  decryptBytes,
  decryptText,
  encryptBytes,
  encryptText,
} from '../security/envelope';
import {
  applicationApprovalHash,
  applicationPackageContentHash,
  applicationPreflightHash,
  reconciliationFreshnessFinding,
  sha256Text,
  type ApplicationPackageState,
  type FrozenApplicationPackageMaterial,
} from './package-state';

export type FreezeApplicationPackageInput = {
  opportunityId?: string;
  jobPostingId: string;
  jobSnapshotId: string;
  cvVersionId: string;
  roleFitOverrideId?: string;
  supersedesPackageId?: string;
  canonicalOpportunityKey: string;
  companyCanonicalName: string;
  sourceSnapshotHash: string;
  recipient: string;
  recipientVerifiedAt: string;
  recipientVerificationEvidence: readonly postgres.JSONValue[];
  subject: string;
  body: string;
  cvContentHash: string;
  attachment: {
    filename: string;
    base64UrlContent: string;
    expectedByteLength: number;
    expectedSha256: string;
  };
  roleFitHash: string;
  idempotencyKey: string;
};

export type ApplicationPackageMetadata = {
  id: string;
  state: ApplicationPackageState;
  contentHash: string;
  canonicalOpportunityKey: string;
  recipientDomain: string;
  attachmentSha256: string;
  createdAt: string;
  updatedAt: string;
};

export type ApplicationPackageApproval = {
  id: string;
  packageId: string;
  approvalHash: string;
  approvedAt: string;
};

export type ApplicationPackagePreflight = {
  packageId: string;
  allowed: boolean;
  findings: string[];
  preflightHash: string;
  reconciledAt: string;
};

export type PreviouslySentApplication = Pick<OutboundApplication, 'canonicalJobKey' | 'company' | 'recipient'>;

function databaseUrl(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.NODE_ENV !== 'production') return 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
  return null;
}

async function loadKey(sql: ReturnType<typeof postgres>) {
  const keys = await sql<{decrypted_secret: string}[]>`
    select decrypted_secret from vault.decrypted_secrets
    where name='opportunity_data_key_v1' limit 1
  `;
  if (!keys[0]?.decrypted_secret) throw new Error('Application package encryption key is unavailable.');
  return decodeDataKey(keys[0].decrypted_secret);
}

function assertSha256(value: string, field: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`APPLICATION_PACKAGE_HASH_INVALID:${field}`);
}

function recipientParts(value: string) {
  const recipient = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new Error('APPLICATION_PACKAGE_RECIPIENT_INVALID');
  return {recipient, domain: recipient.slice(recipient.lastIndexOf('@') + 1)};
}

function serializedJsonByteLength(value: postgres.JSONValue) {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function packageMetadata(row: {
  id: string;
  current_state: ApplicationPackageState;
  package_content_hash: string;
  canonical_opportunity_key: string;
  recipient_domain: string;
  attachment_sha256: string;
  created_at: Date;
  updated_at: Date;
}): ApplicationPackageMetadata {
  return {
    id: row.id,
    state: row.current_state,
    contentHash: row.package_content_hash,
    canonicalOpportunityKey: row.canonical_opportunity_key,
    recipientDomain: row.recipient_domain,
    attachmentSha256: row.attachment_sha256,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function validateFreezeInput(input: FreezeApplicationPackageInput) {
  assertSha256(input.sourceSnapshotHash, 'sourceSnapshotHash');
  assertSha256(input.cvContentHash, 'cvContentHash');
  assertSha256(input.roleFitHash, 'roleFitHash');
  assertSha256(input.attachment.expectedSha256.toLowerCase(), 'attachmentSha256');
  if (!input.canonicalOpportunityKey.trim()) throw new Error('APPLICATION_PACKAGE_CANONICAL_KEY_MISSING');
  if (!input.companyCanonicalName.trim()) throw new Error('APPLICATION_PACKAGE_COMPANY_MISSING');
  if (!input.subject.trim()) throw new Error('APPLICATION_PACKAGE_SUBJECT_MISSING');
  if (!input.body.trim()) throw new Error('APPLICATION_PACKAGE_BODY_MISSING');
  if (input.idempotencyKey.length < 16 || input.idempotencyKey.length > 300) {
    throw new Error('APPLICATION_PACKAGE_IDEMPOTENCY_KEY_INVALID');
  }
  if (
    input.recipientVerificationEvidence.length === 0 ||
    input.recipientVerificationEvidence.some(
      (item) => item === null || typeof item !== 'object' || Array.isArray(item),
    ) ||
    serializedJsonByteLength(input.recipientVerificationEvidence) > 16_000
  ) {
    throw new Error('APPLICATION_PACKAGE_RECIPIENT_VERIFICATION_EVIDENCE_INVALID');
  }
  const verifiedAt = new Date(input.recipientVerifiedAt).getTime();
  if (!Number.isFinite(verifiedAt) || verifiedAt > Date.now() + 5 * 60_000) {
    throw new Error('APPLICATION_PACKAGE_RECIPIENT_VERIFICATION_INVALID');
  }
}

export async function freezeApplicationPackage(
  input: FreezeApplicationPackageInput,
  userId: string,
): Promise<ApplicationPackageMetadata> {
  validateFreezeInput(input);
  const url = databaseUrl();
  if (!url) throw new Error('Application package database is unavailable.');
  const verifiedAttachment = verifyPdfAttachment(input.attachment);
  const {recipient, domain} = recipientParts(input.recipient);
  const material: FrozenApplicationPackageMaterial = {
    canonicalOpportunityKey: input.canonicalOpportunityKey,
    companyCanonicalName: input.companyCanonicalName,
    sourceSnapshotHash: input.sourceSnapshotHash,
    recipient,
    recipientVerifiedAt: new Date(input.recipientVerifiedAt).toISOString(),
    subject: input.subject,
    body: input.body,
    cvVersionId: input.cvVersionId,
    cvContentHash: input.cvContentHash,
    attachmentFilename: verifiedAttachment.filename,
    attachmentSha256: verifiedAttachment.sha256,
    attachmentByteLength: verifiedAttachment.byteLength,
    roleFitHash: input.roleFitHash,
    roleFitOverrideId: input.roleFitOverrideId ?? null,
  };
  const packageContentHash = applicationPackageContentHash(material);
  const sql = postgres(url, {max: 1, prepare: false});
  try {
    const key = await loadKey(sql);
    return await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${`${userId}:${input.idempotencyKey}`}))`;
      const existing = await tx<
        {
          id: string;
          current_state: ApplicationPackageState;
          package_content_hash: string;
          canonical_opportunity_key: string;
          recipient_domain: string;
          attachment_sha256: string;
          idempotency_key: string;
          created_at: Date;
          updated_at: Date;
        }[]
      >`
        select id,current_state,package_content_hash,canonical_opportunity_key,recipient_domain,
          attachment_sha256,idempotency_key,created_at,updated_at
        from public.application_packages
        where user_id=${userId}
          and (idempotency_key=${input.idempotencyKey} or package_content_hash=${packageContentHash})
        order by (idempotency_key=${input.idempotencyKey}) desc
        limit 1
      `;
      if (existing[0]) {
        if (
          existing[0].idempotency_key === input.idempotencyKey &&
          existing[0].package_content_hash !== packageContentHash
        ) {
          throw new Error('APPLICATION_PACKAGE_IDEMPOTENCY_CONTENT_MISMATCH');
        }
        return packageMetadata(existing[0]);
      }

      const bindings = await tx<{source_snapshot_hash: string; cv_content_hash: string; cv_lifecycle: string}[]>`
        select snapshot.content_hash source_snapshot_hash,cv.content_hash cv_content_hash,cv.lifecycle cv_lifecycle
        from public.job_snapshots snapshot
        join public.job_postings posting on posting.id=snapshot.job_posting_id
        join public.cv_versions cv on cv.id=${input.cvVersionId} and cv.user_id=posting.user_id
        where snapshot.id=${input.jobSnapshotId} and posting.id=${input.jobPostingId}
          and posting.user_id=${userId}
        limit 1
      `;
      const binding = bindings[0];
      if (!binding) throw new Error('APPLICATION_PACKAGE_OWNED_BINDINGS_MISSING');
      if (binding.source_snapshot_hash !== input.sourceSnapshotHash) {
        throw new Error('APPLICATION_PACKAGE_SOURCE_SNAPSHOT_HASH_MISMATCH');
      }
      if (binding.cv_content_hash !== input.cvContentHash || binding.cv_lifecycle !== 'APPROVED') {
        throw new Error('APPLICATION_PACKAGE_APPROVED_CV_MISMATCH');
      }

      if (input.opportunityId) {
        const opportunities = await tx<{job_posting_id: string | null}[]>`
          select job_posting_id from public.opportunities
          where id=${input.opportunityId} and user_id=${userId} limit 1
        `;
        if (!opportunities[0]) throw new Error('APPLICATION_PACKAGE_OPPORTUNITY_NOT_OWNED');
        if (opportunities[0].job_posting_id !== input.jobPostingId) {
          throw new Error('APPLICATION_PACKAGE_OPPORTUNITY_JOB_MISMATCH');
        }
      }
      if (input.roleFitOverrideId) {
        const overrides = await tx<{analysis_hash: string; job_posting_id: string}[]>`
          select analysis_hash,job_posting_id from public.cv_role_fit_overrides
          where id=${input.roleFitOverrideId} and user_id=${userId} limit 1
        `;
        if (overrides[0]?.analysis_hash !== input.roleFitHash || overrides[0]?.job_posting_id !== input.jobPostingId) {
          throw new Error('APPLICATION_PACKAGE_ROLE_FIT_OVERRIDE_MISMATCH');
        }
      }
      if (input.supersedesPackageId) {
        const superseded = await tx<{canonical_opportunity_key: string; current_state: ApplicationPackageState}[]>`
          select canonical_opportunity_key,current_state from public.application_packages
          where id=${input.supersedesPackageId} and user_id=${userId} limit 1
        `;
        if (!superseded[0]) throw new Error('APPLICATION_PACKAGE_SUPERSEDED_NOT_OWNED');
        if (
          superseded[0].canonical_opportunity_key.trim().toLowerCase() !==
          input.canonicalOpportunityKey.trim().toLowerCase()
        ) {
          throw new Error('APPLICATION_PACKAGE_SUPERSEDED_OPPORTUNITY_MISMATCH');
        }
        if (superseded[0].current_state === 'SENT') {
          throw new Error('APPLICATION_PACKAGE_SUPERSEDED_ALREADY_SENT');
        }
      }

      const id = randomUUID();
      const recipientPayload = encryptText(recipient, key, applicationPackagePayloadAad(userId, id, 'recipient'));
      const subjectPayload = encryptText(input.subject, key, applicationPackagePayloadAad(userId, id, 'subject'));
      const bodyPayload = encryptText(input.body, key, applicationPackagePayloadAad(userId, id, 'body'));
      const pdfPayload = encryptBytes(
        Buffer.from(verifiedAttachment.base64UrlContent, 'base64url'),
        key,
        applicationPackagePayloadAad(userId, id, 'pdf'),
      );

      await tx`
        insert into public.application_packages(
          id,user_id,opportunity_id,job_posting_id,job_snapshot_id,cv_version_id,
          role_fit_override_id,supersedes_package_id,canonical_opportunity_key,company_canonical_name,
          source_snapshot_hash,recipient_hash,recipient_domain,recipient_verified_at,
          recipient_verification_evidence,subject_hash,body_hash,cv_content_hash,
          attachment_filename,attachment_sha256,attachment_byte_length,role_fit_hash,
          package_content_hash,idempotency_key,current_state
        ) values(
          ${id},${userId},${input.opportunityId ?? null},${input.jobPostingId},${input.jobSnapshotId},${input.cvVersionId},
          ${input.roleFitOverrideId ?? null},${input.supersedesPackageId ?? null},
          ${input.canonicalOpportunityKey},${input.companyCanonicalName.trim().toLowerCase()},
          ${input.sourceSnapshotHash},${sha256Text(recipient)},${domain},${material.recipientVerifiedAt},
          ${tx.json(input.recipientVerificationEvidence)},${sha256Text(input.subject)},${sha256Text(input.body)},
          ${input.cvContentHash},${verifiedAttachment.filename},${verifiedAttachment.sha256},
          ${verifiedAttachment.byteLength},${input.roleFitHash},${packageContentHash},${input.idempotencyKey},'PACKAGE_DRAFT'
        )
      `;
      await tx`
        insert into private.application_package_payloads(
          package_id,user_id,recipient_ciphertext,recipient_nonce,recipient_aad_hash,
          subject_ciphertext,subject_nonce,subject_aad_hash,body_ciphertext,body_nonce,body_aad_hash,
          pdf_ciphertext,pdf_nonce,pdf_aad_hash,encryption_key_version
        ) values(
          ${id},${userId},${recipientPayload.ciphertext},${recipientPayload.nonce},${recipientPayload.aadHash},
          ${subjectPayload.ciphertext},${subjectPayload.nonce},${subjectPayload.aadHash},
          ${bodyPayload.ciphertext},${bodyPayload.nonce},${bodyPayload.aadHash},
          ${pdfPayload.ciphertext},${pdfPayload.nonce},${pdfPayload.aadHash},1
        )
      `;
      await tx`
        select set_config('app.application_package_transition_source','PACKAGE_FREEZE',true),
          set_config(
            'app.application_package_transition_evidence',
            ${JSON.stringify([{type: 'PACKAGE_CONTENT_HASH', hash: packageContentHash}])},
            true
          )
      `;
      const rows = await tx<
        {
          id: string;
          current_state: ApplicationPackageState;
          package_content_hash: string;
          canonical_opportunity_key: string;
          recipient_domain: string;
          attachment_sha256: string;
          created_at: Date;
          updated_at: Date;
        }[]
      >`
        update public.application_packages set current_state='REVIEW_REQUIRED'
        where id=${id} and user_id=${userId} and current_state='PACKAGE_DRAFT'
        returning id,current_state,package_content_hash,canonical_opportunity_key,recipient_domain,
          attachment_sha256,created_at,updated_at
      `;
      if (!rows[0]) throw new Error('APPLICATION_PACKAGE_FREEZE_TRANSITION_FAILED');
      return packageMetadata(rows[0]);
    });
  } finally {
    await sql.end();
  }
}

export async function approveApplicationPackage(
  packageId: string,
  userId: string,
  approvedAt = new Date(),
): Promise<ApplicationPackageApproval> {
  const url = databaseUrl();
  if (!url) throw new Error('Application package database is unavailable.');
  const sql = postgres(url, {max: 1, prepare: false});
  try {
    return await sql.begin(async (tx) => {
      const packages = await tx<{id: string; current_state: ApplicationPackageState; package_content_hash: string}[]>`
        select id,current_state,package_content_hash from public.application_packages
        where id=${packageId} and user_id=${userId} for update
      `;
      const item = packages[0];
      if (!item) throw new Error('APPLICATION_PACKAGE_NOT_FOUND');
      const existing = await tx<{id: string; approval_hash: string; approved_at: Date}[]>`
        select id,approval_hash,approved_at from public.application_package_approvals
        where package_id=${packageId} and user_id=${userId} and package_content_hash=${item.package_content_hash}
        limit 1
      `;
      if (existing[0]) {
        return {
          id: existing[0].id,
          packageId,
          approvalHash: existing[0].approval_hash,
          approvedAt: existing[0].approved_at.toISOString(),
        };
      }
      if (item.current_state !== 'REVIEW_REQUIRED') {
        throw new Error(`APPLICATION_PACKAGE_NOT_REVIEWABLE:${item.current_state}`);
      }
      const approvedAtIso = approvedAt.toISOString();
      const approvalHash = applicationApprovalHash({
        packageId,
        userId,
        packageContentHash: item.package_content_hash,
        approvedAt: approvedAtIso,
      });
      const approvals = await tx<{id: string; approved_at: Date}[]>`
        insert into public.application_package_approvals(
          package_id,user_id,package_content_hash,approval_hash,approved_by,approved_at
        ) values(
          ${packageId},${userId},${item.package_content_hash},${approvalHash},${userId},${approvedAtIso}
        ) returning id,approved_at
      `;
      await tx`
        select set_config('app.application_package_transition_source','USER_APPROVAL',true),
          set_config(
            'app.application_package_transition_evidence',
            ${JSON.stringify([{type: 'APPROVAL_HASH', hash: approvalHash}])},
            true
          )
      `;
      const transitioned = await tx`
        update public.application_packages set current_state='APPROVED'
        where id=${packageId} and user_id=${userId} and current_state='REVIEW_REQUIRED'
        returning id
      `;
      if (!transitioned[0] || !approvals[0]) throw new Error('APPLICATION_PACKAGE_APPROVAL_TRANSITION_FAILED');
      return {id: approvals[0].id, packageId, approvalHash, approvedAt: approvals[0].approved_at.toISOString()};
    });
  } finally {
    await sql.end();
  }
}

export async function recordApplicationPackagePreflight(
  packageId: string,
  userId: string,
  input: {reconciledAt: string; sent: PreviouslySentApplication[]; now?: Date},
): Promise<ApplicationPackagePreflight> {
  const reconciledTimestamp = new Date(input.reconciledAt);
  if (!Number.isFinite(reconciledTimestamp.getTime())) {
    throw new Error('APPLICATION_PACKAGE_RECONCILIATION_INVALID');
  }
  const reconciledAt = reconciledTimestamp.toISOString();
  const url = databaseUrl();
  if (!url) throw new Error('Application package database is unavailable.');
  const sql = postgres(url, {max: 1, prepare: false});
  try {
    const key = await loadKey(sql);
    return await sql.begin(async (tx) => {
      const rows = await tx<
        {
          id: string;
          current_state: ApplicationPackageState;
          package_content_hash: string;
          canonical_opportunity_key: string;
          company_canonical_name: string;
          recipient_hash: string;
          recipient_verified_at: Date;
          subject_hash: string;
          body_hash: string;
          attachment_filename: string;
          attachment_sha256: string;
          attachment_byte_length: number;
          recipient_ciphertext: Buffer;
          recipient_nonce: Buffer;
          recipient_aad_hash: string;
          subject_ciphertext: Buffer;
          subject_nonce: Buffer;
          subject_aad_hash: string;
          body_ciphertext: Buffer;
          body_nonce: Buffer;
          body_aad_hash: string;
          pdf_ciphertext: Buffer;
          pdf_nonce: Buffer;
          pdf_aad_hash: string;
        }[]
      >`
        select package.id,package.current_state,package.package_content_hash,
          package.canonical_opportunity_key,package.company_canonical_name,package.recipient_hash,
          package.recipient_verified_at,package.subject_hash,package.body_hash,package.attachment_filename,
          package.attachment_sha256,package.attachment_byte_length,
          payload.recipient_ciphertext,payload.recipient_nonce,payload.recipient_aad_hash,
          payload.subject_ciphertext,payload.subject_nonce,payload.subject_aad_hash,
          payload.body_ciphertext,payload.body_nonce,payload.body_aad_hash,
          payload.pdf_ciphertext,payload.pdf_nonce,payload.pdf_aad_hash
        from public.application_packages package
        join private.application_package_payloads payload
          on payload.package_id=package.id and payload.user_id=package.user_id
        where package.id=${packageId} and package.user_id=${userId}
        for update of package
      `;
      const item = rows[0];
      if (!item) throw new Error('APPLICATION_PACKAGE_NOT_FOUND');
      if (!['APPROVED', 'PREFLIGHT_READY'].includes(item.current_state)) {
        throw new Error(`APPLICATION_PACKAGE_NOT_APPROVED:${item.current_state}`);
      }

      const recipient = decryptText(
        {ciphertext: item.recipient_ciphertext, nonce: item.recipient_nonce, aadHash: item.recipient_aad_hash},
        key,
        applicationPackagePayloadAad(userId, packageId, 'recipient'),
      );
      const subject = decryptText(
        {ciphertext: item.subject_ciphertext, nonce: item.subject_nonce, aadHash: item.subject_aad_hash},
        key,
        applicationPackagePayloadAad(userId, packageId, 'subject'),
      );
      const body = decryptText(
        {ciphertext: item.body_ciphertext, nonce: item.body_nonce, aadHash: item.body_aad_hash},
        key,
        applicationPackagePayloadAad(userId, packageId, 'body'),
      );
      const pdf = decryptBytes(
        {ciphertext: item.pdf_ciphertext, nonce: item.pdf_nonce, aadHash: item.pdf_aad_hash},
        key,
        applicationPackagePayloadAad(userId, packageId, 'pdf'),
      );
      if (
        sha256Text(recipient) !== item.recipient_hash ||
        sha256Text(subject) !== item.subject_hash ||
        sha256Text(body) !== item.body_hash
      ) {
        throw new Error('APPLICATION_PACKAGE_PAYLOAD_HASH_MISMATCH');
      }
      verifyPdfAttachment({
        filename: item.attachment_filename,
        base64UrlContent: pdf.toString('base64url'),
        expectedByteLength: Number(item.attachment_byte_length),
        expectedSha256: item.attachment_sha256,
      });

      const audit = auditApplicationBatch(
        [
          {
            canonicalJobKey: item.canonical_opportunity_key,
            company: item.company_canonical_name,
            recipient,
            recipientVerified: Boolean(item.recipient_verified_at),
            subject,
            body,
            attachmentSha256: item.attachment_sha256,
          },
        ],
        input.sent,
      );
      const findings = [...audit.findings];
      const freshnessFinding = reconciliationFreshnessFinding(reconciledAt, input.now ?? new Date());
      if (freshnessFinding) findings.push(freshnessFinding);
      const uniqueFindings = [...new Set(findings)];
      const preflightHash = applicationPreflightHash({
        packageId,
        packageContentHash: item.package_content_hash,
        reconciledAt: reconciledAt,
        findings: uniqueFindings,
      });
      const allowed = uniqueFindings.length === 0;
      await tx`
        insert into public.application_package_preflights(
          package_id,user_id,package_content_hash,preflight_hash,reconciled_at,findings,allowed
        ) values(
          ${packageId},${userId},${item.package_content_hash},${preflightHash},${reconciledAt},
          ${tx.json(uniqueFindings)},${allowed}
        ) on conflict(preflight_hash) do nothing
      `;

      const targetState = allowed ? 'PREFLIGHT_READY' : 'APPROVED';
      if (item.current_state !== targetState) {
        await tx`
          select set_config('app.application_package_transition_source','PREFLIGHT',true),
            set_config(
              'app.application_package_transition_evidence',
              ${JSON.stringify([
                {type: 'PREFLIGHT_HASH', hash: preflightHash},
                {type: 'PREFLIGHT_ALLOWED', value: allowed},
              ])},
              true
            )
        `;
        const transitioned = await tx`
          update public.application_packages set current_state=${targetState}
          where id=${packageId} and user_id=${userId} and current_state=${item.current_state}
          returning id
        `;
        if (!transitioned[0]) throw new Error('APPLICATION_PACKAGE_PREFLIGHT_TRANSITION_FAILED');
      }
      return {packageId, allowed, findings: uniqueFindings, preflightHash, reconciledAt: reconciledAt};
    });
  } finally {
    await sql.end();
  }
}
