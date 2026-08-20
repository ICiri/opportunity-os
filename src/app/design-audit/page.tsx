import {getDatabaseHealth} from '@/lib/db/health';
import {getPrivateMailThread, getPrivateMailThreadSummaries} from '@/lib/gmail/repository';
import {loadPersistedHunterJobs} from '@/lib/hunter/persistence';

export const dynamic = 'force-dynamic';
const LOCAL_USER_ID = process.env.OPPORTUNITY_LOCAL_USER_ID ?? '20000000-0000-4000-8000-000000000001';

type Finding = {
  level: 'PASS' | 'WARNING' | 'BLOCKED';
  title: string;
  evidence: string;
  principle: string;
  test: string;
};

export default async function DesignAudit() {
  const [database, summaries, jobs] = await Promise.all([
    getDatabaseHealth(),
    getPrivateMailThreadSummaries(LOCAL_USER_ID).catch(() => ({})),
    loadPersistedHunterJobs(500).catch(() => []),
  ]);
  const privateThreads = Object.keys(summaries).length;
  const decryptedThread =
    privateThreads > 0 ? await getPrivateMailThread(Object.keys(summaries)[0]!, LOCAL_USER_ID).catch(() => null) : null;
  const privatePayloadVerified = Boolean(decryptedThread?.messages.length);
  const aiConnected = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL);
  const schedulerConfigured = Boolean(process.env.HUNTER_CRON_SECRET && process.env.HUNTER_CRON_SECRET.length >= 32);
  const findings: Finding[] = [
    {
      level: database.status === 'CONNECTED' && privatePayloadVerified ? 'PASS' : 'BLOCKED',
      title: 'Private conversation evidence is reachable',
      evidence: privatePayloadVerified
        ? `${privateThreads} Gmail threads are present and at least one private payload passed Vault-backed server-side decryption.`
        : 'Private payload decryption was not verified; no sample mail is substituted.',
      principle: 'Security boundary + truthful system status',
      test: 'Public message bodies remain empty and private payloads decrypt only server-side.',
    },
    {
      level: jobs.length > 0 ? 'PASS' : 'BLOCKED',
      title: 'Opportunity cards come from persisted live ATS checks',
      evidence: `${jobs.length} currently live persisted job records are available; static shortlist cards are not used.`,
      principle: 'Cairo · evidence before presentation',
      test: 'Every card opens its recorded source URL and shows eligibility uncertainty explicitly.',
    },
    {
      level: 'PASS',
      title: 'Primary actions remain human-controlled',
      evidence:
        'CV output is saved as DRAFT; the product does not send Gmail, submit applications or run bounty tests automatically.',
      principle: 'Norman · feedback and reversible action',
      test: 'Approval UI states explicitly that local approval did not send anything.',
    },
    {
      level: 'WARNING',
      title: 'Low-glare visual tokens are implemented; test evidence is external',
      evidence:
        'Warm graphite surfaces, sage accents and muted text are present in CSS, but this runtime page does not persist or prove the latest screenshot, contrast and accessibility run.',
      principle: 'Refactoring UI + perceptual comfort',
      test: 'Desktop and mobile screenshots plus WCAG contrast/accessibility tests pass.',
    },
    {
      level: aiConnected ? 'PASS' : 'WARNING',
      title: aiConnected
        ? 'Source-linked OpenAI provider is configured'
        : 'OpenAI provider is intentionally disconnected',
      evidence: aiConnected
        ? 'A server-side key and explicit model are configured; outputs still require schema, fact-ID checks and human semantic review.'
        : 'No server-side OpenAI key/model is available, so generation returns 503 and creates no fallback draft.',
      principle: 'Fail closed; never counterfeit intelligence',
      test: 'Missing configuration returns OPENAI_DISCONNECTED and records no successful AI run.',
    },
    {
      level: 'WARNING',
      title: 'Remote production authentication is not connected',
      evidence:
        'Selecting an auth mode is not treated as authentication. No Supabase session validation is implemented; only loopback development access is allowed and production requests fail with 503.',
      principle: 'Least privilege',
      test: 'Non-loopback anonymous requests cannot reach private routes.',
    },
    {
      level: 'WARNING',
      title: schedulerConfigured
        ? 'Scheduler secret exists; deployment is unverified'
        : '11:00 scheduler deployment is not connected',
      evidence: schedulerConfigured
        ? 'The protected endpoint has a sufficiently long secret, but no external scheduler heartbeat proves an 11:00 deployment.'
        : 'The local manual hunter works, but no scheduler secret/deployed trigger is claimed.',
      principle: 'Operational honesty',
      test: 'A scheduled run is idempotent for each Europe/Zagreb local date.',
    },
    {
      level: 'WARNING',
      title: 'Gmail evidence is imported, not continuously synchronized',
      evidence:
        'The current encrypted records came from the real mailbox capture; app-level Gmail OAuth and incremental sync are still absent.',
      principle: 'Freshness must be visible',
      test: 'Do not label Gmail as live sync until OAuth refresh and incremental import tests pass.',
    },
  ];
  const passed = findings.filter((finding) => finding.level === 'PASS').length;

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <span className="kicker">Runtime-backed UX and integrity review</span>
          <h1>Design audit</h1>
          <p>Evidence, principle and an acceptance criterion for every claim. No decorative score.</p>
        </div>
        <div className="audit-score">
          <strong>
            {passed}/{findings.length}
          </strong>
          <small> checks passing now</small>
        </div>
      </div>
      <div className="audit-findings">
        {findings.map((finding) => (
          <article key={finding.title}>
            <span className={`audit-level ${finding.level.toLowerCase()}`}>{finding.level}</span>
            <div>
              <h2>{finding.title}</h2>
              <dl>
                <dt>Evidence</dt>
                <dd>{finding.evidence}</dd>
                <dt>Principle</dt>
                <dd>{finding.principle}</dd>
                <dt>Acceptance</dt>
                <dd>{finding.test}</dd>
              </dl>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
