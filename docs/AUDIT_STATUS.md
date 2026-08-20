# Opportunity OS implementation audit

Audit date: 16 August 2026 (Europe/Zagreb)

This document separates what was directly verified from what is implemented but not yet proven, and from what is still missing. It is suitable as a handoff checklist; it is not a certification or a “100% works” claim.

## Directly verified local evidence

| Area                    | Evidence                                                                                                                                 | Result          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Schema isolation        | 64 public + 5 private application tables inspected; all 69 had RLS enabled                                                               | PASS            |
| Anonymous access        | `anon` had zero public application table grants                                                                                          | PASS            |
| Private boundary        | `anon` and `authenticated` had no private schema usage/table privileges; service role retained required access                           | PASS            |
| Sensitive public grants | browser roles had no privileges on email messages, raw ingest, forecast points or bounty findings                                        | PASS            |
| Gmail storage           | 21 thread metadata rows, 31 message rows and 31 matching encrypted private payloads; zero public body rows, zero orphan/missing payloads | PASS            |
| Gmail attachments       | no private attachment bytes were imported                                                                                                | NOT IMPLEMENTED |
| CV persistence          | three metadata versions matched three encrypted payloads; approved EN and HR masters plus an EN draft; no orphan/missing payloads        | PASS            |
| Storage                 | `cv-private` and `gmail-attachments-private` existed and were non-public                                                                 | PASS            |
| Runtime source hygiene  | registry contained no `MOCK` source type                                                                                                 | PASS            |
| Hunter persistence      | completed local runs had one metrics row and per-source audit rows; metric ranges and ordering invariants passed                         | PASS            |
| Tenant isolation        | own-row read/update passed and cross-user read/update was blocked inside a rolled-back transaction                                       | PASS            |
| Public-health privacy   | health response contains safe aggregates only                                                                                            | PASS            |

The counts above describe the database at the audit point and will change. Tests assert relational/security invariants rather than fixed counts.

## Regression evidence expected before handoff

Run from the project directory with local Supabase already running:

```powershell
npm run test:db
npm test
npm run typecheck
npm run build
npm run test:smoke
npx playwright test e2e/api.spec.ts e2e/journeys.spec.ts e2e/privacy.spec.ts e2e/routes.spec.ts e2e/resilience.spec.ts --project desktop-chrome
```

The database test is non-destructive except for an explicitly rolled-back RLS transaction. Smoke and Search Run E2E call official configured job endpoints and persist new run evidence. None of these commands sends Gmail or saves a new CV draft.

## Material blockers—do not represent as complete

### P0: production identity and private data

- Supabase application authentication is not wired through repositories. Runtime uses a fixed local user and production correctly fails closed.
- Gmail is a real encrypted snapshot, not continuous OAuth synchronization. There is no shipped repeatable Gmail import CLI, history cursor, token lifecycle or attachment-byte import.
- No Gmail draft/send endpoint exists. Local approval intentionally sends nothing.
- Key rotation, encrypted backup and restore drills have not been implemented or demonstrated.

### P0: CV/AI grounding

- The visible CV preview and seeded career facts contain hardcoded claims. The seeding script does not extract and anchor each claim to the supplied PDF before marking it verified.
- The CV-tailor route accepts client headline/summary input; current grounding checks fact-ID membership but do not prove every generated statement against source spans.
- OpenAI configuration, model pinning and a versioned evaluation set are not demonstrated. The disconnected path fails closed, which is correct, but is not equivalent to a validated intelligence layer.
- Human approval lifecycle from draft to approved CV is not implemented end to end.

### P1: hunter breadth and durability

- Runtime discovery covers selected Greenhouse/Lever tenants only. It does not cover every requested country/source and cannot claim complete remote-job coverage.
- Eligibility is conservative heuristic evidence, not legal/employment advice; “remote” does not prove Croatia eligibility.
- Search execution, polling and rate limiting are process-local. Completed evidence persists, but pollable run state does not survive restart and is not multi-instance safe.
- `npm run hunter:run` prints live CLI results but does not persist them; durable history currently comes from the UI/API Search Run path.
- Cloudflare 11:00 Zagreb scheduling is designed and locally gated but not deployed/proven.

### P1/P2: product truthfulness

- Conversation bodies are real private data, but lifecycle/priority/evidence recommendations remain partly curated static metadata.
- Bounty catalog adapters and authorized-scope version ingestion are not implemented; testing remains correctly blocked.
- Economic scoring lacks sufficient salary/rate inputs for most discovered jobs, so high-fit/EV-hour ranking may remain unavailable rather than fabricated.
- Current test coverage is broad but cannot establish absolute correctness, security or future availability. External security, accessibility usability and restore testing remain required.

## Acceptance criteria for the next release

1. Real Supabase sessions authorize every private read/write and cross-user endpoint tests pass.
2. Gmail OAuth incremental import is repeatable, revocable, encrypted, idempotent and attachment-aware; send remains separately confirmed.
3. CV facts are extracted from the two supplied PDFs with hashes/source spans and human verification; generated claims are traceable to those facts.
4. Search Run queue/polling/idempotency survive process restart and work across instances.
5. Scheduled 11:00 Europe/Zagreb execution is proven in staging across CET/CEST and duplicate delivery.
6. Source registry expands only through verified official access, with measured country/source coverage and no “all jobs” claim.
7. OpenAI model/configuration passes a versioned grounding, injection, refusal, latency and cost evaluation.
8. Security/performance advisors, backup/restore, key rotation and external security review pass in staging.
