import Link from 'next/link';
import {listPersistedConversations} from '@/lib/conversation/repository';
import {getPrivateMailThreadSummaries} from '@/lib/gmail/repository';
import {selectReviewableJobs} from '@/lib/hunter/engine';
import {loadPersistedHunterJobs, loadPersistedHunterMetrics} from '@/lib/hunter/persistence';
import {getHunterOverview} from '@/lib/hunter/run-store';
import {SearchNow} from './search-now';

export const dynamic = 'force-dynamic';

const LOCAL_USER_ID = process.env.OPPORTUNITY_LOCAL_USER_ID ?? '20000000-0000-4000-8000-000000000001';
const usableRuntimeStatuses = new Set(['PARTIAL_SUCCESS', 'SUCCESS']);

function zagrebDate() {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Zagreb',
  }).format(new Date());
}

function formatVerification(value?: string | null) {
  if (!value) return 'Parent-feed observation time unavailable';
  return `Parent feed checked ${new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Zagreb',
  }).format(new Date(value))}`;
}

function currentTimestamp() {
  return Date.now();
}

export default async function TodayPage() {
  const hunter = getHunterOverview();
  const [persistedMetricsResult, persistedJobsResult, mailSummariesResult, conversationsResult] =
    await Promise.allSettled([
      loadPersistedHunterMetrics(),
      loadPersistedHunterJobs(500),
      getPrivateMailThreadSummaries(LOCAL_USER_ID),
      listPersistedConversations(LOCAL_USER_ID),
    ]);
  const persistedMetrics = persistedMetricsResult.status === 'fulfilled' ? persistedMetricsResult.value : null;
  const persistedJobs = persistedJobsResult.status === 'fulfilled' ? persistedJobsResult.value : [];
  const mailSummaries = mailSummariesResult.status === 'fulfilled' ? mailSummariesResult.value : {};
  const conversations = conversationsResult.status === 'fulfilled' ? (conversationsResult.value ?? []) : [];
  const hasRuntimeResult = Boolean(
    hunter.latestRun &&
    usableRuntimeStatuses.has(hunter.latestRun.status) &&
    hunter.latestRun.durability === 'POSTGRES',
  );
  const metrics = hasRuntimeResult ? hunter.metrics : (persistedMetrics ?? hunter.metrics);
  const hunterJobs = selectReviewableJobs(hasRuntimeResult ? hunter.jobs : persistedJobs);
  const queue = [...conversations].sort((left, right) => right.priority - left.priority);
  const primary = queue[0];
  const mailConnected = Object.keys(mailSummaries).length > 0;
  const now = currentTimestamp();
  const replies = queue.filter(
    (conversation) => conversation.state !== 'DELIVERY_FAILURE' && (mailSummaries[conversation.id]?.inbound ?? 0) > 0,
  );
  const waiting = queue.filter((conversation) => {
    const summary = mailSummaries[conversation.id];
    const dueAt = conversation.nextActionAt ? new Date(conversation.nextActionAt).getTime() : Number.POSITIVE_INFINITY;
    return conversation.state === 'WAITING' && Boolean(summary?.messages) && summary.inbound === 0 && dueAt <= now;
  });
  const currentHunterJobs = hunterJobs.filter((job) => job.availability === 'LIVE');
  const staleHunterJobs = hunterJobs.filter((job) => job.availability === 'UNKNOWN');

  return (
    <div className="page today-page">
      <div className="topbar dashboard-head">
        <div>
          <span className="kicker">{zagrebDate()} · Zagreb</span>
          <h1>Make the next hour count.</h1>
          <p>One decision cockpit ordered by audited priority and persisted evidence, not an unverified EV claim.</p>
        </div>
        <SearchNow />
      </div>
      {primary && (
        <section className="hero-action">
          <div className="hero-index">01</div>
          <div>
            <span className="kicker green">Best next action</span>
            <h2>Review the {primary.company} path.</h2>
            <p>{primary.nextAction}</p>
            <div className="hero-meta">
              <span>EV requires verified assumptions</span>
              <span>{primary.priority} audit priority</span>
              <span>{mailSummaries[primary.id]?.messages ?? 0} persisted messages</span>
            </div>
          </div>
          <Link href={`/conversations/${primary.id}`} className="primary-link">
            Open conversation <span>→</span>
          </Link>
        </section>
      )}
      <section className="metric-strip">
        <article>
          <span>Stored hunter candidates</span>
          <strong>{hunterJobs.length}</strong>
          <small>
            {currentHunterJobs.length} live · {staleHunterJobs.length} verification stale
          </small>
        </article>
        <article>
          <span>Inbound threads requiring judgment</span>
          <strong>{replies.length}</strong>
          <small>
            {mailConnected
              ? 'Inbound mail observed; human/automatic not classified'
              : 'Private mail database unavailable'}
          </small>
        </article>
        <article>
          <span>Follow-ups due</span>
          <strong>{waiting.length}</strong>
          <small>
            {mailConnected ? 'Persisted outbound threads without reply' : 'Private mail database unavailable'}
          </small>
        </article>
        <article>
          <span>Configured hunter sources</span>
          <strong>
            {metrics.liveSources}/{metrics.runnableSources}
          </strong>
          <small>
            <Link href="/hunter">{metrics.sourceCoverage}% coverage of configured runnable sources →</Link>
          </small>
        </article>
      </section>
      <div className="dashboard-grid">
        <section>
          <div className="section-head">
            <div>
              <span className="kicker">Decision queue</span>
              <h2>What deserves attention</h2>
            </div>
            <Link href="/conversations">View all {queue.length} audit records →</Link>
          </div>
          <div className="decision-list">
            {queue.slice(0, 7).map((conversation, index) => {
              const summary = mailSummaries[conversation.id];
              return (
                <Link className="decision" href={`/conversations/${conversation.id}`} key={conversation.id}>
                  <span className="decision-rank">{String(index + 1).padStart(2, '0')}</span>
                  <div className="decision-main">
                    <div>
                      <b>{conversation.company}</b>
                      <span className={`state ${conversation.state.toLowerCase()}`}>
                        {conversation.state.replaceAll('_', ' ')}
                      </span>
                    </div>
                    <p>{conversation.nextAction}</p>
                    <small>
                      {conversation.contact} · {conversation.country} ·{' '}
                      {summary
                        ? `${summary.messages} persisted message${summary.messages === 1 ? '' : 's'}`
                        : 'mail not imported'}
                    </small>
                  </div>
                  <div className="priority">
                    <strong>{conversation.priority}</strong>
                    <small>audit priority</small>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
        <aside className="radar">
          <div className="section-head">
            <div>
              <span className="kicker">Opportunity radar</span>
              <h2>Stored source candidates</h2>
            </div>
            <Link href="/hunter">Hunter evidence →</Link>
          </div>
          {hunterJobs.length === 0 ? (
            <div className="integrity-note">
              <span>i</span>
              <div>
                <b>No runtime or persisted hunter jobs</b>
                <p>Today does not substitute a static shortlist. Run a configured official source check.</p>
              </div>
            </div>
          ) : (
            hunterJobs.slice(0, 4).map((job) => (
              <a href={job.url} target="_blank" rel="noreferrer" className="radar-link" key={job.id}>
                <article>
                  <div>
                    <span className="fresh">
                      {job.availability} · {job.freshness}
                    </span>
                    <strong>{job.eligibility.replaceAll('_', ' ')}</strong>
                  </div>
                  <h3>{job.title}</h3>
                  <p>
                    {job.company} · {job.location}
                  </p>
                  <small>{job.eligibilityReason}</small>
                  <small>{formatVerification(job.verifiedAt)}</small>
                </article>
              </a>
            ))
          )}
          <div className="integrity-note">
            <span>!</span>
            <div>
              <b>No bounty executor is connected</b>
              <p>
                The catalog is read-only. The authorization guard must be wired and tested before any future bounty
                execution feature exists.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
