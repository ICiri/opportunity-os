# Source registry

| Source                               | Current state                                       | Access and boundary                                                                                    |
| ------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Selected Greenhouse boards           | Runtime adapter and durable persistence implemented | Official public Job Board API; each tenant must pass the current live check                            |
| Selected Lever sites                 | Runtime adapter and durable persistence implemented | Official public Postings API; each tenant must pass the current live check                             |
| EURES / national employment services | Research only                                       | Enable only after official access, terms, normalization and freshness are verified                     |
| Commercial job boards                | Research / possibly blocked                         | No scraping is enabled; never claim access without terms and authorization evidence                    |
| Gmail private snapshot               | Real encrypted local import present                 | Bodies decrypt server-side; continuous OAuth/history sync and repeatable importer are not implemented  |
| Gmail drafts/send                    | Not implemented                                     | Every send requires a separate explicit user confirmation; local approval sends nothing                |
| Bounty platforms                     | Research only                                       | Discovery is separate from testing; no action without current written scope and `AUTHORIZED_SCOPE=YES` |

Recorded or synthetic provider payloads are test-only. Runtime source rows use supported types and never use a `MOCK` type. A source becomes `LIVE` only from a successful timestamped check, and stale evidence must degrade rather than remain implicitly live.

Current coverage is selected Greenhouse/Lever tenants, not “all remote work.” Report source coverage as live configured sources divided by runnable configured sources, alongside source names, timestamps, countries/markets and failures. Do not infer country eligibility from the word “remote” alone.

Before enabling any additional adapter, record:

- official access method and terms/robots decision;
- rate limits, retry/backoff and contact information;
- supported countries and remote/contract semantics;
- freshness and removal behavior;
- stable external ID and canonical dedupe rules;
- fields required for eligibility and economic scoring;
- test fixtures and a fail-closed path.
