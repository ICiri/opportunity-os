# Architecture

## Current local system

Next.js App Router renders the product and owns server-side access to private Gmail, CV and AI payloads. Local development uses one configured local user ID and a direct server-side Postgres connection. Anonymous pages are allowed only in development/test on loopback; production requests fail closed with `503 AUTH_CONNECTION_REQUIRED` until Supabase Auth is connected and the authenticated user identity replaces the fixed local identity.

Supabase Postgres is the source of truth for completed hunter evidence, source state, job postings, conversation metadata, CV version metadata and audits. Sensitive Gmail bodies, CV document bytes and AI payloads are AES-GCM envelope-encrypted in the `private` schema. `anon` and `authenticated` have neither schema usage nor table privileges there. Public `email_messages.body_ciphertext` is required to remain null. Private Storage buckets exist but are non-public.

The browser receives only the selected decrypted conversation through server rendering and approved CV PDFs through an allowlisted server route. It never receives a database service-role key or the envelope key. CV version listing returns metadata only.

## Hunter flow

`SEARCH NOW` creates an in-process queued run, calls only configured official Greenhouse/Lever public endpoints, then executes:

`fetch → normalize → canonicalize → deduplicate → freshness → eligibility → score → audit → persist`

Completed runs, per-source outcomes, metrics, raw ingest, snapshots and live postings are transactionally persisted. Opportunity pages read persisted live postings and show an explicit empty state if none exist. No runtime fallback imports static/sample jobs.

The queue, pollable run map and rate limiter are still process-local. A process restart preserves persisted results but not the pollable run object. Production therefore needs a durable queue/worker and database-backed polling/idempotency before horizontal scaling.

The `hunter:run` and `hunter:jobs` CLI commands wait for that same run path to reach a terminal state and succeed only when the result is stored with `POSTGRES` durability. After the CLI process exits, its run ID cannot be polled through `/api/search-runs/:id` because polling is still process-local. `/hunter` and Today instead reload persisted metrics and jobs directly; database-backed historical run polling remains explicit follow-up work.

## Scheduled and AI architecture

The scheduled route verifies a server secret, timestamp freshness, Europe/Zagreb 11:00 gating and an idempotency key. Cloudflare Cron/Worker is the intended single production scheduler, but deployment is not proven by the local repository.

The OpenAI provider runs server-side through the Responses API, requires explicit key/model configuration, validates structured output and records encrypted audit payloads. It fails closed without configuration. Career-fact extraction, claim-level source anchoring and model evaluation remain release blockers; see `AUDIT_STATUS.md`.

## Test boundary

Unit tests may use recorded/synthetic provider payloads and never call public providers. Database integration validates the existing encrypted local state. Smoke and the dedicated real Search Run E2E exercise configured official endpoints and persist their results; they must be run deliberately when network checks are acceptable.
