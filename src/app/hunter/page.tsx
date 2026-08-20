import {SearchNow} from '../search-now';
import {selectReviewableJobs} from '@/lib/hunter/engine';
import {loadPersistedHunterJobs, loadPersistedHunterMetrics} from '@/lib/hunter/persistence';
import {getHunterOverview} from '@/lib/hunter/run-store';
import styles from './hunter.module.css';

export const dynamic = 'force-dynamic';

const usableRuntimeStatuses = new Set(['PARTIAL_SUCCESS', 'SUCCESS']);

function formatInstant(value?: string | null) {
  if (!value) return 'not provided by source';
  return new Date(value).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Zagreb',
  });
}

export default async function HunterPage() {
  const overview = getHunterOverview();
  const [persistedMetricsResult, persistedJobsResult] = await Promise.allSettled([
    loadPersistedHunterMetrics(),
    loadPersistedHunterJobs(500),
  ]);
  const persistedMetrics = persistedMetricsResult.status === 'fulfilled' ? persistedMetricsResult.value : null;
  const persistedJobs = persistedJobsResult.status === 'fulfilled' ? persistedJobsResult.value : [];
  const hasRuntimeResult = Boolean(
    overview.latestRun &&
    usableRuntimeStatuses.has(overview.latestRun.status) &&
    overview.latestRun.durability === 'POSTGRES',
  );
  const metrics = hasRuntimeResult ? overview.metrics : (persistedMetrics ?? overview.metrics);
  const jobs = selectReviewableJobs(hasRuntimeResult ? overview.jobs : persistedJobs);
  const currentJobs = jobs.filter((job) => job.availability === 'LIVE');
  const staleJobs = jobs.filter((job) => job.availability === 'UNKNOWN');
  const snapshotOrigin = hasRuntimeResult
    ? 'LATEST PROCESS RUN'
    : persistedMetrics || persistedJobs.length > 0
      ? 'POSTGRES SNAPSHOT'
      : 'NO DATA SNAPSHOT';
  const schedulerConfigured = Boolean(process.env.HUNTER_CRON_SECRET && process.env.HUNTER_CRON_SECRET.length >= 32);

  return (
    <div className={`page ${styles.page}`}>
      <div className="topbar">
        <div>
          <span className="kicker">Official sources · fail closed</span>
          <h1>Daily hunter</h1>
          <p>
            Greenhouse and Lever use their public job-posting APIs. A source becomes LIVE only after a successful
            runtime check; research sources are never silently scraped.
          </p>
        </div>
        <SearchNow label="RUN LIVE SOURCE CHECK" />
      </div>

      <section className={styles.schedule} aria-label="Daily schedule">
        <div>
          <span>Daily time</span>
          <strong>11:00</strong>
          <small>Europe/Zagreb · CET/CEST aware</small>
        </div>
        <div>
          <span>Scheduler</span>
          <strong>{schedulerConfigured ? 'CONFIGURED' : 'SCAFFOLD ONLY'}</strong>
          <small>
            {schedulerConfigured
              ? 'Secret is present; deployment is still external.'
              : 'No cron secret. Nothing is scheduled locally.'}
          </small>
        </div>
        <div>
          <span>Displayed data</span>
          <strong>{snapshotOrigin}</strong>
          <small>
            {hasRuntimeResult
              ? `Latest run durability: ${overview.durability.replace('_', ' ')}.`
              : 'The last successful persisted snapshot survives an app restart.'}
          </small>
        </div>
      </section>

      <section className={styles.metrics} aria-label="Hunter metrics">
        {[
          [
            'Configured-source coverage',
            `${metrics.sourceCoverage}%`,
            `${metrics.liveSources}/${metrics.runnableSources} configured runnable sources succeeded`,
          ],
          [
            'Observed source regions',
            String(metrics.countriesCovered),
            'Region tags from successful sources; not market coverage',
          ],
          [
            'Jobs discovered',
            String(metrics.jobsDiscovered),
            `${metrics.canonicalJobs} canonical in the displayed run`,
          ],
          ['Fresh jobs', String(metrics.freshJobs), 'Live and published no more than seven days ago'],
          [
            'Currently verified eligible',
            String(metrics.eligibleJobs),
            `${metrics.likelyEligibleJobs} likely · ${metrics.unknownEligibilityJobs} unknown`,
          ],
          ['High-fit jobs', String(metrics.highFitJobs), 'Zero until evidence-based fit scoring exists'],
        ].map(([label, value, note]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </section>

      <div className={styles.grid}>
        <section>
          <div className="section-head">
            <div>
              <span className="kicker">Source registry</span>
              <h2>Connection truth</h2>
            </div>
            <span>{overview.registry.length} entries</span>
          </div>
          <div className={styles.sources}>
            {overview.registry.map((source) => (
              <article key={source.id}>
                <div>
                  <span className={`${styles.status} ${styles[source.status.toLowerCase()]}`}>{source.status}</span>
                  <b>{source.provider ?? 'RESEARCH'}</b>
                </div>
                <h3>{source.name}</h3>
                <p>{source.note}</p>
                <small>{source.markets.length > 0 ? source.markets.join(' · ') : 'No market coverage claimed'}</small>
              </article>
            ))}
          </div>
        </section>
        <aside className={styles.audit}>
          <span className="kicker">Latest process run</span>
          <h2>{overview.latestRun?.status ?? 'NO RUN IN THIS PROCESS'}</h2>
          <dl>
            <dt>Trigger</dt>
            <dd>{overview.latestRun?.triggerType ?? '—'}</dd>
            <dt>Started</dt>
            <dd>
              {overview.latestRun
                ? new Date(overview.latestRun.createdAt).toLocaleString('en-GB', {timeZone: 'Europe/Zagreb'})
                : '—'}
            </dd>
            <dt>Failure</dt>
            <dd>{overview.latestRun?.failureCode?.replaceAll('_', ' ') ?? '—'}</dd>
            <dt>Displayed jobs</dt>
            <dd>
              {jobs.length} ({currentJobs.length} currently verified)
            </dd>
          </dl>
          <div className="integrity-note">
            <span>!</span>
            <div>
              <b>No coverage theatre</b>
              <p>
                Coverage is the share of configured runnable sources that succeeded in the displayed run. It is not a
                claim of country, market or internet coverage.
              </p>
            </div>
          </div>
        </aside>
      </div>

      <section className={styles.jobs} aria-label="Stored opportunity candidates">
        <div className="section-head">
          <div>
            <span className="kicker">Runtime or persisted evidence</span>
            <h2>Reviewable opportunities</h2>
          </div>
          <span>
            {currentJobs.length} live · {staleJobs.length} verification stale
          </span>
        </div>
        {jobs.length === 0 ? (
          <div className="integrity-note">
            <span>i</span>
            <div>
              <b>No result in this process or Postgres</b>
              <p>Run the official source check. The UI will not substitute example jobs.</p>
            </div>
          </div>
        ) : (
          <div className={styles.jobList}>
            {jobs.slice(0, 30).map((job) => (
              <article key={job.id}>
                <div>
                  <span className={`${styles.status} ${styles[job.eligibility.toLowerCase()]}`}>
                    {job.eligibility.replaceAll('_', ' ')}
                  </span>
                  <small>
                    {job.availability} · {job.freshness} · {job.provider ?? 'ATS'}
                  </small>
                </div>
                <h3>{job.title}</h3>
                <b>{job.company}</b>
                <p>{job.location}</p>
                <small>{job.eligibilityReason}</small>
                <small>
                  Last official parent-feed observation: {formatInstant(job.verifiedAt)} · Published:{' '}
                  {formatInstant(job.publishedAt)}
                </small>
                <div className={styles.jobActions}>
                  <a href={job.url} target="_blank" rel="noreferrer">
                    Open official posting ↗
                  </a>
                  <a href={`/cv-studio?opportunity=${encodeURIComponent(job.id)}`}>Prepare CV →</a>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
