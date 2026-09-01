# Third-party integration inventory

## JobSpy bridge

- Package: `python-jobspy` 1.1.82
- Upstream: https://github.com/speedyapply/JobSpy
- License: MIT
- Purpose: optional public job-board discovery through the loopback-only bridge in `integrations/jobspy`
- Boundary: no account credentials, Gmail data, CV bytes or application-package payloads are passed to the service

FastAPI 0.116.1 and Uvicorn 0.35.0 provide the local HTTP wrapper. Exact direct dependency versions and the Python 3.12.11 base image are pinned in the integration files. Transitive dependency resolution occurs when the local Docker image is rebuilt.

The browser autofill code is maintained in this repository and does not embed code from the evaluated third-party extensions.
