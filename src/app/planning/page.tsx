import Link from 'next/link';
import {BusinessPlanner} from '@/components/business-planner';
import {businessPrinciples} from '@/data/business-principles';
import {loadPortfolio} from '@/lib/planning/repository';

export const dynamic = 'force-dynamic';
const LOCAL_USER_ID = process.env.OPPORTUNITY_LOCAL_USER_ID ?? '20000000-0000-4000-8000-000000000001';

const cadence = [
  [
    '5 DAYS',
    'Calibrate',
    'Choose and verify a target-account count, review any recorded delivery-failure or referral paths, and record a baseline.',
  ],
  [
    '15 DAYS',
    'Learn',
    'Run evidence-led discovery conversations; refine segment and positioning from behavior, not compliments.',
  ],
  [
    '30 DAYS',
    'Prove',
    'Review qualified EV/hour, proposal conversion and pipeline coverage. Stop channels that produce activity without legitimate opportunity.',
  ],
  [
    'QUARTER',
    'Repeat',
    'Document one repeatable acquisition motion, one delivery package and one referral/customer-success cadence.',
  ],
  [
    'HALF-YEAR',
    'Stabilize',
    'Reduce concentration risk, validate retention and build capacity only against observed demand.',
  ],
  [
    '1 YEAR',
    'Compound',
    'Maintain a trusted client portfolio, recurring referral paths and auditable revenue by source, country and offer.',
  ],
  [
    '3 YEARS',
    'Scale carefully',
    'Productize proven services, add vetted delivery capacity and preserve quality, security and client outcomes as hard constraints.',
  ],
] as const;

export default async function PlanningPage() {
  const portfolio = await loadPortfolio(LOCAL_USER_ID);
  const firms = portfolio
    ? [...new Map(portfolio.map((row) => [row.company, row])).values()].sort(
        (left, right) => right.priority - left.priority,
      )
    : [];

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <span className="kicker">Business operating system</span>
          <h1>Build a durable book of business.</h1>
          <p>Pipeline, capacity, trust and retention modeled together—without pretending assumptions are facts.</p>
        </div>
        <div className="planning-status">
          <span>Primary metric</span>
          <b>Qualified EV / hour</b>
          <small>Guardrail: relationship health</small>
        </div>
      </div>
      <BusinessPlanner />
      <section className="operating-cadence">
        <div className="section-head">
          <div>
            <span className="kicker">Execution horizon</span>
            <h2>From five days to three years</h2>
          </div>
          <span>Evidence gates before scale</span>
        </div>
        <div>
          {cadence.map(([time, title, action], index) => (
            <article key={time}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <time>{time}</time>
              <h3>{title}</h3>
              <p>{action}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="client-portfolio">
        <div className="section-head">
          <div>
            <span className="kicker">Persisted relationship continuity</span>
            <h2>Companies and next contact</h2>
          </div>
          <span>{portfolio === null ? 'DB disconnected' : `${firms.length} companies`}</span>
        </div>
        {portfolio === null ? (
          <div className="empty-state">
            <p>No sample client portfolio is displayed while the private database is unavailable.</p>
          </div>
        ) : (
          <div className="portfolio-table" role="region" aria-label="Company portfolio table" tabIndex={0}>
            <div className="portfolio-row header">
              <span>Company</span>
              <span>Thread</span>
              <span>State</span>
              <span>Priority</span>
              <span>Next action</span>
            </div>
            {firms.slice(0, 10).map((firm) => (
              <div className="portfolio-row" key={firm.company}>
                <b>{firm.company}</b>
                <Link href={`/conversations/${firm.threadId}`}>Open</Link>
                <span>{firm.state.replaceAll('_', ' ')}</span>
                <strong>{firm.priority}</strong>
                <span>{firm.nextAction}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="principle-catalog">
        <div className="section-head">
          <div>
            <span className="kicker">Authored design guidance</span>
            <h2>Book-based rules and acceptance targets</h2>
          </div>
          <span>{businessPrinciples.length} review targets · implementation varies</span>
        </div>
        <div>
          {businessPrinciples.map((principle) => (
            <article key={principle.id}>
              <header>
                <span>{principle.domain}</span>
                <b>{principle.source}</b>
              </header>
              <h3>{principle.rule}</h3>
              <dl>
                <dt>Target behavior</dt>
                <dd>{principle.productBehavior}</dd>
                <dt>Acceptance target</dt>
                <dd>{principle.acceptance}</dd>
              </dl>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
