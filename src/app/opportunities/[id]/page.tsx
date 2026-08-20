import Link from 'next/link';
import {notFound} from 'next/navigation';
import {loadPersistedHunterJobs} from '@/lib/hunter/persistence';

export const dynamic = 'force-dynamic';

export default async function OpportunityPage({params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const job = (await loadPersistedHunterJobs(500)).find((item) => item.id === id);
  if (!job) notFound();
  const checkedAt = job.verifiedAt
    ? new Date(job.verifiedAt).toLocaleString('en-GB', {timeZone: 'Europe/Zagreb'})
    : 'not recorded';

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <span className="kicker">
            {job.company} · parent feed observed {checkedAt}
          </span>
          <h1>{job.title}</h1>
          <p>{job.location}</p>
        </div>
        <span className={`state ${job.eligibility === 'ELIGIBLE' ? 'referred' : 'waiting'}`}>
          {job.eligibility.replaceAll('_', ' ')}
        </span>
      </div>
      <div className="opportunity-detail">
        <section>
          <h2>Eligibility evidence</h2>
          <p>{job.eligibilityReason}</p>
          <ul>
            {job.eligibilityEvidence.length ? (
              job.eligibilityEvidence.map((evidence) => <li key={evidence}>✓ {evidence}</li>)
            ) : (
              <li>! Croatia eligibility is not explicit; verify before applying.</li>
            )}
          </ul>
          <h2>Source state</h2>
          <dl>
            <dt>Availability</dt>
            <dd>{job.availability}</dd>
            <dt>Verification scope</dt>
            <dd>Present in the successful official parent-feed response; posting URL not independently fetched</dd>
            <dt>Freshness</dt>
            <dd>{job.freshness}</dd>
            <dt>Published</dt>
            <dd>
              {job.publishedAt
                ? new Date(job.publishedAt).toLocaleString('en-GB', {timeZone: 'Europe/Zagreb'})
                : 'Source did not expose a publication date'}
            </dd>
            <dt>Economic score</dt>
            <dd>
              {job.scoringStatus === 'SCORED'
                ? 'Based on recorded value/probability/effort inputs'
                : 'Not calculated — required inputs are missing'}
            </dd>
          </dl>
        </section>
        <aside>
          <span className="kicker">Human-controlled next actions</span>
          <Link className="primary-link" href={`/cv-studio?opportunity=${job.id}&language=en`}>
            Prepare a CV draft <span>→</span>
          </Link>
          <a className="secondary-button" href={job.url} target="_blank" rel="noreferrer">
            Open official listing ↗
          </a>
          <p>
            Re-check the listing and work authorization before applying. Opportunity OS will not submit it
            automatically.
          </p>
        </aside>
      </div>
    </div>
  );
}
