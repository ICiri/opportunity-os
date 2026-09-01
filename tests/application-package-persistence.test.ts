import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const migration = readFileSync('supabase/migrations/20260830130000_durable_application_packages.sql', 'utf8');
const repository = readFileSync('src/lib/applications/package-repository.ts', 'utf8');

describe('durable application package persistence', () => {
  it('stores public hashes separately from immutable encrypted payloads', () => {
    expect(migration).toContain('create table public.application_packages');
    expect(migration).toContain('create table private.application_package_payloads');
    expect(migration).toContain('package_content_hash text not null');
    expect(migration).toContain('recipient_hash text not null');
    expect(migration).toContain('attachment_sha256 text not null');
    expect(migration).toContain('recipient_ciphertext bytea not null');
    expect(migration).toContain('pdf_ciphertext bytea not null');
    expect(migration).toContain('application_package_payloads_immutable');
    expect(repository).toContain("import 'server-only'");
    expect(repository).toContain('encryptText(recipient');
    expect(repository).toContain('encryptBytes(');
  });

  it('enforces ownership while reserving all writes for the trusted server boundary', () => {
    expect(migration).toContain('alter table public.application_packages enable row level security');
    expect(migration).toContain('alter table private.application_package_payloads enable row level security');
    expect(migration).toContain('application_packages_select_own');
    expect(migration).toContain('auth.uid())=user_id');
    expect(migration).not.toContain('application_packages_insert_own');
    expect(migration).not.toMatch(/grant select,insert on public\.application_packages/);
    expect(migration).toContain('grant select,insert,update,delete on public.application_packages');
    expect(migration).toContain('to service_role');
    expect(migration).toContain('revoke all on private.application_package_payloads from anon,authenticated');
  });

  it('makes package content and audit records immutable and validates state evidence', () => {
    expect(migration).toContain('APPLICATION_PACKAGE_INITIAL_STATE_INVALID');
    expect(migration).toContain('APPLICATION_PACKAGE_CONTENT_IMMUTABLE');
    expect(migration).toContain('APPLICATION_PACKAGE_IMMUTABLE_RECORD');
    expect(migration).toContain('APPLICATION_PACKAGE_APPROVAL_MISSING');
    expect(migration).toContain('APPLICATION_PACKAGE_PREFLIGHT_MISSING');
    expect(migration).not.toContain("REVIEW_REQUIRED' and new.current_state in ('PACKAGE_DRAFT'");
    expect(migration).not.toContain("FAILED' and new.current_state in ('PREFLIGHT_READY'");
    expect(migration).toContain("FAILED' and new.current_state in ('APPROVED','CANCELLED')");
  });

  it('binds package creation to owned source, CV, opportunity and override records', () => {
    expect(repository).toContain('APPLICATION_PACKAGE_OWNED_BINDINGS_MISSING');
    expect(repository).toContain('APPLICATION_PACKAGE_SOURCE_SNAPSHOT_HASH_MISMATCH');
    expect(repository).toContain('APPLICATION_PACKAGE_APPROVED_CV_MISMATCH');
    expect(repository).toContain('APPLICATION_PACKAGE_OPPORTUNITY_JOB_MISMATCH');
    expect(repository).toContain('APPLICATION_PACKAGE_ROLE_FIT_OVERRIDE_MISMATCH');
    expect(repository).toContain('APPLICATION_PACKAGE_SUPERSEDED_ALREADY_SENT');
  });

  it('keeps delivery disabled while preserving the future idempotent audit schema', () => {
    expect(migration).toContain('create table public.application_delivery_attempts');
    expect(migration).toContain('unique(user_id,idempotency_key)');
    expect(repository).not.toMatch(/sendMail|gmail\.users\.messages\.send|provider_message_id/);
  });
});
