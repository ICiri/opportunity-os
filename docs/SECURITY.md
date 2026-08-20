# Security

## Verified local controls

- RLS is enabled on every application table in both `public` and `private` schemas.
- User-owned public roots use ownership policies; global source/principle definitions are authenticated read-only where needed.
- `anon` has no application table grants.
- `anon` and `authenticated` have no `private` schema usage or table privileges. Only server roles can access private payloads.
- Browser roles have no privileges on `raw_ingest`, `email_messages`, `forecast_points` or `bounty_findings`.
- Gmail bodies, CV bytes and AI payloads are AES-256-GCM envelope-encrypted with a unique 96-bit nonce and AAD binding. The key is loaded server-side from Vault.
- Public email body storage is constrained to null. Database integration proves zero public body rows and one private payload per imported message.
- Approved CV PDFs are decrypted only through allowlisted English/Croatian server routes with private/no-store caching; version listing exposes metadata only.
- Required CV/Gmail Storage buckets are non-public.
- Global responses deny framing/object embedding, restrict permissions/referrers, prevent MIME sniffing and isolate opener/resource contexts.
- Search Run creation has a process-local rolling rate limit and returns `429` with `Retry-After`; deterministic unit tests cover the contract.
- Bounty execution throws unless `AUTHORIZED_SCOPE` is exactly `YES`.
- The Gmail UI has no autonomous send path. “Approve locally” records UI intent only and sends nothing.

## Access boundary

Local development uses a fixed local identity and direct server-side Postgres access. That is acceptable only on loopback. Anonymous access is enabled only for development or the explicit loopback test harness.

Production-mode page/API requests fail closed with `503 AUTH_CONNECTION_REQUIRED` until real Supabase application authentication is implemented. Setting an environment flag alone is not a complete authentication implementation: every repository must derive and authorize the user from a verified server session.

Never expose `DATABASE_URL`, the service-role secret, Vault data key, Gmail tokens or OpenAI keys through `NEXT_PUBLIC_*`, browser JavaScript, logs, traces or error responses.

## Private-data limitations

The current local database contains a real encrypted Gmail snapshot and encrypted CV masters. Continuous Gmail OAuth synchronization, token rotation/revocation, attachment-byte import, a repeatable mailbox import CLI, retention/deletion workflows and backup/restore drills are not complete.

The imported messages' ciphertext/nonce/AAD integrity and relational parity are checked without decrypting content. This is not a formal cryptographic audit. Before deployment, rotate the bootstrap data key, define versioned key rotation, protect backups and test restore/decrypt with a reviewed procedure.

The CV editor now loads career facts from Postgres records linked to the approved EN/HR CV version, SHA-256 hash and a human-reviewed source locator. The transcription is manual: the hash proves the source PDF identity, not semantic equivalence. OpenAI output is constrained to cited fact IDs plus an extractive lexical gate, then saved only as an encrypted, review-required draft. Human line-by-line verification remains mandatory.

## Required pre-production evidence

- Supabase Auth tests with two real sessions across every read/write endpoint;
- database security and performance advisors on linked DEV/staging;
- service-role/Vault secret inventory and rotation test;
- dependency, SAST, secret and external penetration testing;
- Gmail OAuth threat model and replay/revocation tests;
- OpenAI prompt-injection, grounding, refusal, cost and data-retention evaluation;
- durable queue/idempotency and restart recovery tests;
- backup/restore, audit retention, incident response and privacy deletion drills.

See `DEPLOYMENT.md` and `AUDIT_STATUS.md` for the release blockers.
