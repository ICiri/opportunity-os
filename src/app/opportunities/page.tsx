import Link from 'next/link';
import {loadPersistedHunterJobs} from '@/lib/hunter/persistence';
import {reviewableRemoteJobs, toOpportunityView} from '@/lib/opportunities/view-model';

export const dynamic = 'force-dynamic';

export default async function OpportunitiesPage() {
  const jobs = reviewableRemoteJobs(await loadPersistedHunterJobs(500)).map(toOpportunityView);
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
          <h1>Remote opportunities</h1>
          <p>
            Only persisted Greenhouse/Lever listings with explicit remote wording and explicit or likely Croatia/EU
            eligibility are shown. No manual shortlist and no invented fit score.
          </p>
        </div>
        <div className="planning-status">
          <span>Reviewable now</span>
          <b>{jobs.length}</b>
          <small>{eligible} explicitly eligible</small>
        </div>
      </div>
      {jobs.length === 0 ? (
        <section className="empty-state">
          <h2>No verified remote opportunity is available</h2>
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
