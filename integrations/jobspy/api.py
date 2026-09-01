from __future__ import annotations

import math
from typing import Annotated

from fastapi import FastAPI, Query
from jobspy import scrape_jobs

app = FastAPI(title="Opportunity OS JobSpy bridge", docs_url=None, redoc_url=None)
ALLOWED_SITES = {"indeed", "linkedin", "glassdoor", "google", "zip_recruiter"}


def clean(value):
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/v1/search_jobs")
def search_jobs(
    site_name: Annotated[list[str], Query()] = ["indeed"],
    search_term: str = Query(min_length=2, max_length=160),
    location: str = Query(min_length=2, max_length=120),
    results_wanted: int = Query(default=20, ge=1, le=100),
    hours_old: int = Query(default=168, ge=1, le=720),
    is_remote: bool = True,
    job_type: str | None = None,
    description_format: str = "markdown",
):
    sites = [site for site in site_name if site in ALLOWED_SITES]
    if not sites or len(sites) != len(site_name):
        return {"jobs": [], "error": "UNSUPPORTED_SITE"}
    frame = scrape_jobs(
        site_name=sites,
        search_term=search_term,
        location=location,
        results_wanted=results_wanted,
        hours_old=hours_old,
        is_remote=is_remote,
        job_type=job_type,
        description_format=description_format,
        verbose=0,
    )
    return {"jobs": [{key: clean(value) for key, value in row.items()} for row in frame.to_dict("records")]}
