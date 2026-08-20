import {loadCommunicationMetrics} from '@/lib/analytics/repository';

export const dynamic = 'force-dynamic';
const LOCAL_USER_ID = process.env.OPPORTUNITY_LOCAL_USER_ID ?? '20000000-0000-4000-8000-000000000001';

export default async function Analytics() {
  const metrics = await loadCommunicationMetrics(LOCAL_USER_ID);
  const sent = metrics?.trackedThreads ?? 0;
  const ratio = (value: number) => (sent > 0 ? Math.round((value / sent) * 100) : 0);
  const funnel = metrics
    ? ([
        ['Tracked Gmail threads', metrics.trackedThreads, 100],
        ['No recorded delivery failure', metrics.noRecordedFailureThreads, ratio(metrics.noRecordedFailureThreads)],
        ['Inbound mail observed', metrics.inboundThreads, ratio(metrics.inboundThreads)],
        ['Recorded positive lifecycle', metrics.positivePathThreads, ratio(metrics.positivePathThreads)],
        ['Recorded referral', metrics.referredThreads, ratio(metrics.referredThreads)],
      ] as const)
    : [];

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <span className="kicker">Persisted outcome evidence</span>
          <h1>Communication performance</h1>
          <p>Counts come from the private local database. Small samples are not treated as causal proof.</p>
        </div>
      </div>
      {!metrics ? (
        <section className="empty-state">
          <h2>Analytics database is disconnected</h2>
          <p>No replacement or sample funnel is displayed.</p>
        </section>
      ) : (
        <>
          <section className="funnel" aria-label="Conversation evidence funnel">
            {funnel.map(([label, value, width]) => (
              <article key={label}>
                <div>
                  <b>{label}</b>
                  <span>{value}</span>
                </div>
                <div className="bar">
                  <i style={{width: `${width}%`}} />
                </div>
              </article>
            ))}
          </section>
          <div className="sample-warning">
            <b>Interviews are not in this funnel</b>
            <p>
              {metrics.interviews} interview record{metrics.interviews === 1 ? '' : 's'} exist, but no persisted
              conversation-to-interview cohort link proves attribution.
            </p>
          </div>
          <div className="sample-warning">
            <b>Small sample warning</b>
            <p>
              {sent} tracked conversations are insufficient to claim that a subject pattern or technique caused an
              outcome. Keep tracking segment, timing and relationship warmth.
            </p>
          </div>
          <section className="pattern-grid">
            <article>
              <span>MESSAGE EXPERIMENTS</span>
              <strong>{metrics.experiments}</strong>
              <p>{metrics.experiments ? 'Versioned tests recorded' : 'No real experiment recorded yet'}</p>
            </article>
            <article>
              <span>ATTRIBUTED OUTCOMES</span>
              <strong>{metrics.experimentOutcomes}</strong>
              <p>
                {metrics.experimentOutcomes
                  ? 'Descriptive only until sample thresholds pass'
                  : 'No attributed result to compare'}
              </p>
            </article>
            <article>
              <span>AUTOMATIC SENDS</span>
              <strong>0</strong>
              <p>Human approval remains required</p>
            </article>
          </section>
        </>
      )}
    </div>
  );
}
