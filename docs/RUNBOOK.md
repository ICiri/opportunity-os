# Local runbook

## Start the existing imported system

1. Copy `.env.example` to `.env.local` and replace placeholders only with local server-side values.
2. Run `npm install`.
3. Start this project's pinned stack with `npm run infra:start`. Its isolated ports are 55321–55329.
4. Run `npm run test:db` before starting the UI. This is read-only except for a rolled-back two-user RLS transaction.
5. Start the loopback site with `npm run dev:start`, inspect `npm run dev:status`, and open <http://127.0.0.1:3000>.
6. Run `npm run test:smoke`. It checks real routes, encrypted CV metadata/PDFs, health and one real configured-source hunter run with durable readback.
7. Stop only the controlled app with `npm run dev:stop`; stop only this Supabase project from this directory with `npm run infra:stop`.

Infrastructure commands are stable aliases around the pinned Supabase commands:

```powershell
npm run infra:start
npm run infra:status
npm run infra:stop
```

Local endpoints:

- API: `http://127.0.0.1:55321`
- Postgres: `127.0.0.1:55322`
- Studio: `http://127.0.0.1:55323`
- Mailpit: `http://127.0.0.1:55324`

## Test commands

```powershell
npm test
npm run test:db
npm run typecheck
npm run audit
npm run build
npm run test:e2e
```

`npm run release:gate` combines these with load, self-check and dependency audit. It is a strong regression gate, not proof of 100% correctness or production readiness. The database must already be running; the E2E server binds to loopback port 3100.

The dedicated real Search Run API/E2E and smoke test call configured official Greenhouse/Lever endpoints. Unit tests use recorded inputs and remain network-independent. Do not run the real checks in an environment where those outbound requests are not intended.

## Hunter operations

The UI/API `SEARCH NOW` path persists completed runs, source results, metrics and jobs. `npm run hunter:run` currently performs a live CLI inspection and prints the result but does not persist it; do not treat CLI output as durable history. `hunter:company` and `hunter:bounty` fail closed because no verified adapter is enabled for those modes.

Source status is evidence from a timestamped run, not a permanent claim. Re-check a posting immediately before applying.

## Destructive reset warning

`npm run infra:reset` is intentionally blocked unless the destructive confirmation flag is supplied. A confirmed reset delegates to the existing pinned `supabase:reset` command and destroys the current imported Gmail messages, encrypted CV payloads, hunter history and all local edits. It is not part of the normal proof workflow.

```powershell
npm run infra:reset -- --confirm-destroy-local-data
```

Use reset only for a disposable clean database after verifying the exact target. Afterward you must re-import real data. Master CVs can be imported with:

```powershell
npx tsx scripts/import-cv-masters.ts --en <english.pdf> --hr <croatian.pdf>
```

No repeatable Gmail OAuth/import CLI is currently shipped. Fixture seeding is test/demo data only and cannot reconstruct the real private mailbox. Back up the local database before destructive operations.

## Failure triage

- `AUTH_CONNECTION_REQUIRED`: expected on production-mode requests until Supabase Auth is implemented.
- `OPENAI_DISCONNECTED`: server key/model is absent or invalid; no fallback AI draft is generated.
- `PERSISTENCE_FAILED` / `AUDIT_FAILED`: the provider result was not durably committed; do not use process-memory output as evidence.
- `NO_RUNNABLE_SOURCES`: no valid configured official tenant exists.
- `ALL_SOURCES_DISCONNECTED`: configured tenants all failed their live check.
- CV/Gmail `503`: private DB, Vault key or encrypted payload access failed; do not substitute sample content.
