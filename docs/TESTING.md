# Testing

Opportunity OS uses layered release evidence. Passing tests reduces known risk; it does not prove 100% correctness, complete source coverage, production security or future provider availability.

## Fast deterministic regression

`npm test` runs Vitest suites for scoring, lifecycle precedence, checkpoint safety, normalization/deduplication, eligibility, source registry validation, provider adapters, scheduling/DST, conversation strategy, relationship graphs, forecasting, sales safety, chart linting, bounty scope, encryption, OpenAI parsing/configuration, privacy boundaries, production access guard and Search Run/rate-limit state contracts.

Unit tests may use recorded/synthetic provider payloads. Those inputs never become runtime jobs.

## Database integration

`npm run test:db` targets the isolated local Supabase database and checks invariants rather than fixed counts:

- required public/private tables exist and every table has RLS enabled;
- `anon` has no public table grants;
- `anon` and `authenticated` have no private schema/table access;
- service role retains required private access;
- sensitive public tables have no browser privileges;
- public email body rows equal zero;
- every imported Gmail message and CV version has a valid non-orphaned encrypted payload;
- both approved master-CV languages and private buckets exist;
- runtime sources contain no `MOCK` type;
- completed hunter runs have metrics and per-source audit rows with valid ranges;
- own-row reads/updates work and cross-user reads/updates fail in a rolled-back two-user transaction.

This test intentionally requires the existing real local Gmail/CV/hunter state. It does not reset, decrypt or print private content. A clean empty database needs imports and a persisted hunter run before this evidence gate can pass.

Run these against the exact linked DEV project before promotion:

```powershell
npx supabase db advisors --local --type security --fail-on warn
npx supabase db advisors --local --type performance --fail-on warn
```

## Smoke test

`npm run test:smoke` targets an already-running loopback site. It discovers the first real conversation and opportunity link instead of using fixed IDs, verifies health and private CV versions/PDF signatures, then launches one configured-source Search Run and requires durable Postgres completion, coherent metrics and readback. If opportunities are empty, only an explicit truthful empty state passes.

Smoke calls configured official job endpoints; run it deliberately. It never sends Gmail or creates a CV draft.

## Browser regression

Run `npm run build` followed by `npm run test:e2e`. Playwright starts an isolated production server on loopback port 3100 and does not reuse the development server.

Coverage includes:

- known pages plus the first persisted conversation/opportunity at desktop and mobile viewports;
- truthful opportunity empty state when no persisted live job exists;
- HTTP/heading/main-landmark checks, runtime/console failures and horizontal overflow;
- automated WCAG 2 A/AA and WCAG 2.1 A/AA checks with axe-core;
- internal links, dynamic 404s and unsupported API methods;
- database health, private CV metadata/decryption boundary and scheduler fail-closed behavior;
- desktop-only real-provider Search Run checks with polling, durable persistence, source evidence and metric invariants;
- Search Now UI, private conversation sequence, CV preview, explainability and human-only local email approval;
- responsive visual baselines and graph/planning/navigation behavior;
- concurrent read-only health/missing-run traffic and security headers.

Real provider runs are not repeated on mobile; mobile rendering/accessibility is tested independently. Rate limiting is deterministic in Vitest instead of launching a burst of external provider requests.

Failures retain screenshots/traces in `test-results/`; the HTML report is written to `playwright-report/`.

## Complete gate

`npm run test:load` sends 100,000 deterministic records through the ingestion engine and enforces duration, memory, uniqueness and duplicate limits.

`npm run release:gate` combines unit, load, database, type, audit, self-check, production build, browser and high-severity dependency checks. Local Supabase must already be running. External deployment, OAuth, scheduler, backup/restore and model evaluation require separate staging evidence described in `DEPLOYMENT.md` and `AUDIT_STATUS.md`.
