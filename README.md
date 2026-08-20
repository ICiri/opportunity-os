# Opportunity OS

Local-first, mobile-first opportunity intelligence for jobs, contracts, referrals and explicitly authorized bounty programs. The product ranks work by evidence, eligibility and expected value per hour while keeping every email send and CV approval under human control.

## Implemented now

- `/today` decision cockpit and asynchronous `SEARCH NOW` flow
- official Greenhouse and Lever adapters with normalization, canonical deduplication, freshness and conservative Croatia/EU eligibility
- durable Postgres records for completed hunter runs, per-source outcomes, metrics, raw ingest and live job postings; runtime discovery never substitutes sample jobs
- persisted opportunity list/detail/CV hand-off, with a truthful empty state when no live persisted posting exists
- encrypted Gmail message payloads in the non-exposed `private` schema; public message rows contain metadata and zero body payloads
- Conversation Timeline / Audit / Relationship Graph with FACT, INFERENCE and UNKNOWN provenance
- suggested-message review with a local approval gate and no autonomous Gmail send path
- encrypted English and Croatian master CV PDFs, metadata-only version listing and encrypted draft persistence
- server-side OpenAI Responses integration that fails closed when it is not configured
- Company 360, relationship explorer, analytics, deterministic design audit and capacity-aware business planning
- explicit `AUTHORIZED_SCOPE=YES` bounty firewall
- migration-backed public/private schema, ownership RLS, browser grant restrictions and private Storage buckets
- unit, database integration, smoke, API, responsive, accessibility, visual and load test layers

The current boundaries and unproven claims are listed in [docs/AUDIT_STATUS.md](docs/AUDIT_STATUS.md). In particular, this is not a claim of complete internet coverage, production readiness or 100% defect freedom.

For a concise Croatian snapshot of what is actually connected, current local source counts and why the UI may show only two companies, see [docs/TRENUTNO_STANJE.md](docs/TRENUTNO_STANJE.md).

The current continuation point, verified evidence, P0 blockers and exact implementation order are recorded in [docs/AUDIT_HANDOVER_2026-08-20.md](docs/AUDIT_HANDOVER_2026-08-20.md).

## Local start

```powershell
Copy-Item .env.example .env.local
npm install
npm run infra:start
npm run infra:status
npm run test:db
npm run dev:start
npm run dev:status
```

Open <http://127.0.0.1:3000>. Both `dev` and `start` bind to loopback. The controlled server writes only its PID and local logs; `npm run dev:stop` terminates that exact process tree.

Useful routes:

- `/` and `/today` — decision cockpit
- `/conversations` — encrypted private-mail ledger and thread workspaces
- `/opportunities` — currently persisted live hunter results
- `/hunter` — source registry and run evidence
- `/cv-studio` — source-linked extractive tailoring and encrypted review-required draft save
- `/bounties` — discovery separated from authorized testing
- `/relationships` and `/companies/volito-digital/graph` — provenance graphs
- `/planning` and `/analytics` — forecasts and outcome learning
- `/design-audit` — deterministic UX review

## Non-destructive local proof

With the existing imported local database intact and the DEV site running:

```powershell
npm run test:db
npm run test:smoke
npm test
npm run typecheck
```

`test:db` checks schema presence rather than a fixed table count. It also verifies RLS, private/public grants, zero public email bodies, Gmail/CV encrypted-payload parity, private buckets, cross-user isolation and durable hunter evidence. `test:smoke` performs one real configured-source run and persists it; it does not use recorded provider payloads.

`GET /api/health` exposes only connection state, latency and safe aggregate counts. It does not expose message bodies, CV bytes, keys or provider payloads.

## Destructive clean bootstrap

`npm run infra:reset` refuses to run without an explicit destructive confirmation. `npm run infra:reset -- --confirm-destroy-local-data` erases the current local database, including imported Gmail/CV records and hunter history, by delegating to the pinned `supabase:reset` command. Use it only for a disposable clean DEV bootstrap after confirming the target project. Fixture seeding is test/demo data and is not a replacement for the private Gmail/CV import.

The supplied master PDFs can be re-imported with:

```powershell
npx tsx scripts/import-cv-masters.ts --en <english.pdf> --hr <croatian.pdf>
```

There is not yet a repeatable Gmail OAuth/incremental import command. Preserve or back up the current private local database before any reset. See [docs/RUNBOOK.md](docs/RUNBOOK.md).

## Safety

No mass email, LinkedIn automation, fabricated CV claims, exploit automation or bounty testing outside explicit authorized scope. Service-role credentials, the envelope-encryption key and OpenAI credentials are server-only. Production requests fail closed until real Supabase application authentication is implemented.
