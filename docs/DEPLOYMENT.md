# Deployment

The local implementation is intentionally not approved for production. Complete and independently verify every blocker below before exposing it on a non-loopback host.

## Production blockers

1. Implement Supabase Auth end to end. Resolve `user_id` from the verified server session; remove the fixed local-user identity from every repository and mutation path.
2. Replace the process-local Search Run queue, polling map and rate limiter with durable, multi-instance-safe infrastructure. Prove restart recovery and idempotency.
3. Build a repeatable least-privilege Gmail OAuth incremental importer. Token encryption/rotation, revocation, history cursors, attachment handling, replay safety and audit logging are not complete. Sending must remain a separate explicit approval action.
4. Rebuild career facts from the supplied PDFs with claim-level source anchors and human verification. The current hardcoded CV preview and seeded facts are not sufficient provenance for production AI tailoring.
5. Evaluate and pin the OpenAI model/configuration against a versioned test set. Prove grounding, refusal, prompt-injection handling, timeout/retry behavior, cost limits and audit retention.
6. Expand and verify source coverage. Current runtime adapters cover selected Greenhouse/Lever tenants only; they do not prove complete EU/UK/CH/NO/IS/US/CA/AU/NZ coverage or employment eligibility.
7. Deploy and verify the sole scheduler owner, backups, restore drills, key rotation, observability, incident response, dependency/security scanning and privacy/retention policy.
8. Run Supabase security/performance advisors and an external security review against the actual DEV/staging project.

## Supabase DEV/staging

1. Create a dedicated project; never reuse an unrelated database.
2. Install/authenticate the pinned CLI, link the exact project and inspect the target before every migration or reset.
3. Apply migrations to an empty DEV database. They create the public/private schema, RLS, grants, Vault data-key entry and non-public `cv-private` / `gmail-attachments-private` buckets.
4. Verify service-role and Vault secrets exist only in the server environment. Never place them in `NEXT_PUBLIC_*`, logs, browser bundles or CI artifacts.
5. Import approved CV sources and Gmail data through reviewed import tooling, then run `npm run test:db` and both database advisors.
6. Test two distinct real authenticated users, not only the local test identities.

## Cloudflare DEV/staging

1. Create a Worker with a random signed internal token stored as a secret.
2. Route manual and cron triggers to the same durable orchestrator.
3. Configure UTC candidates `0 9 * * *` and `0 10 * * *`; the API must gate on 11:00 Europe/Zagreb and persist one idempotency key per local date across CET/CEST.
4. Prove duplicate delivery, retry, stale timestamp, wrong-secret, DST and database-outage behavior.

## Gmail OAuth

1. Use the minimum Gmail scopes required for the reviewed import/draft workflow.
2. Register exact redirect URIs and keep client secrets/refresh tokens encrypted server-side.
3. Import headers and metadata first; encrypt bodies before persistence and exclude them from logs/analytics.
4. Verify imported classifications against mailbox evidence. The current private snapshot is real local data, not a continuous synchronization proof.
5. Keep send disabled until a separately reviewed user-confirmation endpoint exists. Local “Approve” must never equal Gmail send.

## OpenAI

1. Configure `OPENAI_API_KEY` and an explicitly evaluated `OPENAI_MODEL` only on the server.
2. Keep structured-output validation, fact allowlisting and encrypted audit persistence mandatory.
3. Treat user-entered CV text and job descriptions as untrusted input. Do not promote a generated draft to approved without human review.
4. Set budget, timeout, retry, rate and data-retention controls before enabling production traffic.
