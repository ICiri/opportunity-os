import Link from 'next/link';
import {loadPersistedHunterJobs} from '@/lib/hunter/persistence';
import {allLiveJobs, toOpportunityView} from '@/lib/opportunities/view-model';

export const dynamic = 'force-dynamic';

export default async function OpportunitiesPage() {
  const jobs = allLiveJobs(await loadPersistedHunterJobs(500)).map(toOpportunityView);
  const remote = jobs.filter((job) => job.remotePolicy === 'REMOTE').length;
  const eligible = jobs.filter((job) => job.eligibility === 'ELIGIBLE').length;
  const lastVerified = jobs
    .map((job) => job.verifiedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <span className="kicker">Live official ATS evidence</span>
          <h1>All job opportunities</h1>
          <p>
            Every persisted live listing from Greenhouse, Lever, Ashby and SmartRecruiters is visible. Remote policy and
            Croatia/EU eligibility remain explicit so you can decide what is worth discussing with the company.
          </p>
        </div>
        <div className="planning-status">
          <span>Live opportunities</span>
          <b>{jobs.length}</b>
          <small>
            {remote} remote · {eligible} explicitly eligible
          </small>
        </div>
      </div>
      {jobs.length === 0 ? (
        <section className="empty-state">
          <h2>No verified live opportunity is available</h2>
          <p>Run the hunter with live sources. This screen stays empty instead of substituting sample jobs.</p>
          <Link href="/hunter" className="primary-link">
            Open Daily Hunter <span>→</span>
          </Link>
        </section>
      ) : (
        <div className="opportunity-grid">
          {jobs.map((job) => (
            <Link className="opportunity-card" href={`/opportunities/${job.id}`} key={job.id}>
              <div>
                <span className={`state ${job.eligibility === 'ELIGIBLE' ? 'referred' : 'waiting'}`}>
                  {job.eligibility.replaceAll('_', ' ')}
                </span>
                <strong>{job.freshness}</strong>
              </div>
              <h2>{job.title}</h2>
              <p>
                {job.company} · {job.location}
              </p>
              <small>
                {job.remotePolicy} · {job.remoteEvidence}
              </small>
              <small>{job.eligibilityReason}</small>
              <ul>
                {job.eligibilityEvidence.length ? (
                  job.eligibilityEvidence.map((evidence) => <li key={evidence}>{evidence}</li>)
                ) : (
                  <li>Country eligibility needs source confirmation.</li>
                )}
              </ul>
              <span className="card-action">Open source evidence and CV action →</span>
            </Link>
          ))}
        </div>
      )}
      <p className="source-note">
        Latest official parent-feed observation:{' '}
        {lastVerified ? new Date(lastVerified).toLocaleString('en-GB', {timeZone: 'Europe/Zagreb'}) : 'none'}.
        Individual posting URLs are not claimed as independently fetched. Coverage means configured sources checked,
        never the entire market.
      </p>
    </div>
  );
}
