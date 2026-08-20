import Link from 'next/link';
import {notFound} from 'next/navigation';
import {loadVerifiedCareerFacts} from '@/lib/ai/repository';
import {analyzeRoleFit} from '@/lib/cv-agent/role-fit';
import {hasRoleFitOverride} from '@/lib/cv-agent/repository';
import {loadPersistedHunterJobs} from '@/lib/hunter/persistence';
import {RoleFitOverride} from '@/components/role-fit-override';

export const dynamic = 'force-dynamic';
const LOCAL_USER_ID = process.env.OPPORTUNITY_LOCAL_USER_ID ?? '20000000-0000-4000-8000-000000000001';

export default async function OpportunityPage({params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const [jobs, facts] = await Promise.all([loadPersistedHunterJobs(500), loadVerifiedCareerFacts(LOCAL_USER_ID, 'EN')]);
  const job = jobs.find((item) => item.id === id);
  if (!job) notFound();
  const roleFit = analyzeRoleFit(job.description, facts);
  const overridden = await hasRoleFitOverride(LOCAL_USER_ID, job.id, roleFit.analysisHash);
  const canPrepare = ['EXCELLENT_MATCH', 'GOOD_MATCH'].includes(roleFit.decision) || overridden;
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
          <h2>Requirement matrix</h2>
          {roleFit.requirements.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Requirement</th>
                    <th>Priority</th>
                    <th>Evidence</th>
                    <th>Strength</th>
                    <th>Match</th>
                    <th>Blocker</th>
                  </tr>
                </thead>
                <tbody>
                  {roleFit.requirements.map((requirement) => {
                    const match = roleFit.matches.find((item) => item.requirementId === requirement.id)!;
                    const blocker =
                      requirement.importance === 'HARD_MUST' && ['NO_EVIDENCE', 'CONTRADICTED'].includes(match.status);
                    return (
                      <tr key={requirement.id}>
                        <td>{requirement.text}</td>
                        <td>{requirement.importance}</td>
                        <td>{match.evidenceFactIds.length ? match.evidenceFactIds.join(', ') : 'None'}</td>
                        <td>E{match.evidenceStrength}</td>
                        <td>{match.status}</td>
                        <td>{blocker ? 'YES' : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No explicit requirements were safely decomposed.</p>
          )}
          <h2>Source state</h2>
          <dl>
            <dt>Availability</dt>
            <dd>{job.availability}</dd>
            <dt>Verification scope</dt>
            <dd>Present in the successful official parent-feed response</dd>
            <dt>Freshness</dt>
            <dd>{job.freshness}</dd>
          </dl>
        </section>
        <aside>
          <span className="kicker">CV Agent V2</span>
          <h2>CV preparation decision</h2>
          <span className={`state ${canPrepare ? 'referred' : 'waiting'}`}>{roleFit.decision}</span>
          <p>Technical adjacency: {roleFit.technicalAdjacency}</p>
          <p>
            CV evidence score: {roleFit.cvScore}/100 · Recalculated opportunity score: {roleFit.opportunityScore}/100
          </p>
          {overridden && <p className="approval-status">Immutable human override recorded for this analysis.</p>}
          {roleFit.hardGaps.length > 0 && (
            <ul>
              {roleFit.hardGaps.map((gap) => (
                <li key={gap}>✕ {gap}</li>
              ))}
            </ul>
          )}
          {!canPrepare && roleFit.decision === 'BLOCKED_HARD_GAP' && (
            <RoleFitOverride jobPostingId={job.id} analysisHash={roleFit.analysisHash} gaps={roleFit.hardGaps} />
          )}
          {canPrepare ? (
            <Link className="primary-link" href={`/cv-studio?opportunity=${job.id}&language=en`}>
              Prepare a CV draft <span>→</span>
            </Link>
          ) : (
            <p className="error">CV generation is blocked until the gaps are resolved or an audited override exists.</p>
          )}
          <a className="secondary-button" href={job.url} target="_blank" rel="noreferrer">
            Open official listing ↗
          </a>
          <small>Analysis {roleFit.analysisHash.slice(0, 12)}…</small>
        </aside>
      </div>
    </div>
  );
}
