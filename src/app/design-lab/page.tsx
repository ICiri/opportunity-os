import Link from 'next/link';
import styles from './design-lab.module.css';

const directions = [
  {
    id: 'command-center',
    number: '01',
    name: 'Decision Command Center',
    summary: 'Fastest path from evidence to the single best next action.',
    bestFor: 'Daily prioritization',
    scores: [95, 82, 91, 94],
  },
  {
    id: 'pipeline-studio',
    number: '02',
    name: 'Pipeline Studio',
    summary: 'Dense operational control across jobs, contracts, B2B and referrals.',
    bestFor: 'Reviewing many opportunities',
    scores: [88, 96, 89, 86],
  },
  {
    id: 'relationship-intelligence',
    number: '03',
    name: 'Relationship Intelligence',
    summary: 'Conversation, account context and relationship paths in one workspace.',
    bestFor: 'Winning warm B2B work',
    scores: [86, 88, 96, 84],
  },
];

const pipelineRows = [
  {
    type: 'Contract',
    company: 'Northstar Pay',
    title: 'Payments integration modernization',
    stage: 'Package ready',
    fit: 92,
    value: '€9.6k',
    next: 'Verify engineering lead',
    tone: 'ready',
  },
  {
    type: 'Job',
    company: 'Atlas Systems',
    title: 'Senior .NET platform engineer',
    stage: 'Review',
    fit: 87,
    value: 'Unknown',
    next: 'Resolve location evidence',
    tone: 'review',
  },
  {
    type: 'B2B',
    company: 'Signal Ridge',
    title: 'API reliability advisory',
    stage: 'Qualified',
    fit: 84,
    value: '€5.2k',
    next: 'Map warm introduction',
    tone: 'qualified',
  },
  {
    type: 'Referral',
    company: 'Orbit Consulting',
    title: 'Stockholm client network',
    stage: 'Waiting',
    fit: 78,
    value: 'Unknown',
    next: 'Complete consultant profile',
    tone: 'waiting',
  },
];

function MiniMark({label}: {label: string}) {
  return <span className={styles.miniMark}>{label}</span>;
}

function ScoreBar({value}: {value: number}) {
  return (
    <span className={styles.scoreBar} aria-label={`${value} out of 100`}>
      <i style={{width: `${value}%`}} />
      <b>{value}</b>
    </span>
  );
}

function CommandCenter() {
  return (
    <div className={`${styles.prototype} ${styles.commandPrototype}`}>
      <header className={styles.commandHeader}>
        <div>
          <span>Sunday · Zagreb · private workspace</span>
          <h3>Turn evidence into the next win.</h3>
        </div>
        <button type="button">Run opportunity scan</button>
      </header>

      <section className={styles.nextAction}>
        <span className={styles.actionIndex}>01</span>
        <div>
          <small>Best next action · fact-backed</small>
          <h4>Complete the consultant profile before asking for an update.</h4>
          <p>
            A verified referral is open. Finishing the promised profile increases discoverability without adding
            pressure.
          </p>
          <div className={styles.chipRow}>
            <span>Referral confirmed</span>
            <span>12 min effort</span>
            <span>Human action</span>
          </div>
        </div>
        <button type="button" className={styles.actionButton}>
          Open playbook <span>→</span>
        </button>
      </section>

      <div className={styles.commandMetrics}>
        <article>
          <span>Qualified pipeline</span>
          <b>€32.4k</b>
          <small>Assumption-based · 90 days</small>
        </article>
        <article>
          <span>Replies to judge</span>
          <b>4</b>
          <small>1 referral · 2 warm paths</small>
        </article>
        <article>
          <span>Packages ready</span>
          <b>6</b>
          <small>0 approved for send</small>
        </article>
        <article>
          <span>Source evidence</span>
          <b>9/11</b>
          <small>2 checks stale</small>
        </article>
      </div>

      <div className={styles.commandGrid}>
        <section>
          <div className={styles.miniHeading}>
            <div>
              <small>Decision queue</small>
              <h4>What deserves attention</h4>
            </div>
            <span>Ordered by evidence and timing</span>
          </div>
          <div className={styles.actionList}>
            {[
              ['02', 'Northstar Pay', 'CONTRACT', 'Verify the engineering lead before freezing the package.', '91'],
              ['03', 'Signal Ridge', 'B2B', 'Ask a mutual contact for a context-first introduction.', '86'],
              ['04', 'Atlas Systems', 'JOB', 'Resolve Croatia eligibility; do not infer it from “remote”.', '82'],
            ].map(([rank, company, type, action, score]) => (
              <article key={company}>
                <span>{rank}</span>
                <div>
                  <header>
                    <b>{company}</b>
                    <MiniMark label={type} />
                  </header>
                  <p>{action}</p>
                </div>
                <strong>{score}</strong>
              </article>
            ))}
          </div>
        </section>
        <aside className={styles.evidenceRail}>
          <div className={styles.miniHeading}>
            <div>
              <small>Why now</small>
              <h4>Evidence chain</h4>
            </div>
          </div>
          <ol>
            <li>
              <span>FACT</span>A recruiter forwarded the profile to a second market.
            </li>
            <li>
              <span>FACT</span>A consultant profile was explicitly requested.
            </li>
            <li>
              <span>UNKNOWN</span>
              No second-market response is present in the snapshot.
            </li>
          </ol>
          <button type="button">Show full rationale</button>
        </aside>
      </div>
    </div>
  );
}

function PipelineStudio() {
  return (
    <div className={`${styles.prototype} ${styles.pipelinePrototype}`}>
      <header className={styles.pipelineHeader}>
        <div className={styles.pipelineBrand}>
          <span>O/</span>
          <div>
            <b>Opportunity pipeline</b>
            <small>All work, one operating model</small>
          </div>
        </div>
        <label>
          <span className={styles.visuallyHidden}>Search opportunities</span>
          <input type="search" placeholder="Search company, person or proof…" />
        </label>
        <button type="button">+ Capture signal</button>
      </header>

      <div className={styles.pipelineToolbar}>
        <div role="group" aria-label="Opportunity type">
          <button type="button" aria-pressed="true">
            All <span>38</span>
          </button>
          <button type="button">Jobs 14</button>
          <button type="button">Contract 11</button>
          <button type="button">B2B 8</button>
          <button type="button">Referrals 5</button>
        </div>
        <div>
          <button type="button">Filter 3</button>
          <button type="button">List</button>
          <button type="button">Board</button>
        </div>
      </div>

      <section className={styles.pipelineSummary}>
        <div>
          <span>Qualified value</span>
          <b>€32.4k</b>
          <small>90-day weighted model</small>
        </div>
        <div>
          <span>Needs judgment</span>
          <b>7</b>
          <small>3 evidence gaps</small>
        </div>
        <div>
          <span>Stalled</span>
          <b>4</b>
          <small>More than 10 days</small>
        </div>
        <div className={styles.pipelineFocus}>
          <span>Recommended focus</span>
          <p>Finish 2 packages before adding another source.</p>
        </div>
      </section>

      <div className={styles.pipelineTableWrap}>
        <table className={styles.pipelineTable}>
          <thead>
            <tr>
              <th>Opportunity</th>
              <th>Stage</th>
              <th>Evidence fit</th>
              <th>Expected value</th>
              <th>Next action</th>
              <th aria-label="Open" />
            </tr>
          </thead>
          <tbody>
            {pipelineRows.map((row) => (
              <tr key={`${row.company}:${row.title}`}>
                <td>
                  <span className={`${styles.typeDot} ${styles[row.tone]}`} />
                  <div>
                    <b>{row.company}</b>
                    <small>
                      {row.type} · {row.title}
                    </small>
                  </div>
                </td>
                <td>
                  <MiniMark label={row.stage} />
                </td>
                <td>
                  <ScoreBar value={row.fit} />
                </td>
                <td>
                  <b>{row.value}</b>
                </td>
                <td>
                  <span>{row.next}</span>
                </td>
                <td>
                  <button type="button" aria-label={`Open ${row.company}`}>
                    →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className={styles.pipelineFooter}>
        <span>4 selected views · live claims require timestamped source evidence</span>
        <div>
          <button type="button">Review packages</button>
          <button type="button" disabled>
            Send disabled · approval missing
          </button>
        </div>
      </footer>
    </div>
  );
}

function RelationshipIntelligence() {
  return (
    <div className={`${styles.prototype} ${styles.relationshipPrototype}`}>
      <header className={styles.relationshipHeader}>
        <div>
          <span className={styles.relationshipLogo}>OS</span>
          <b>Relationship intelligence</b>
        </div>
        <nav aria-label="Relationship concept navigation">
          <span>Inbox</span>
          <span>Accounts</span>
          <span>Graph</span>
        </nav>
        <button type="button">Ask from evidence</button>
      </header>

      <div className={styles.relationshipLayout}>
        <aside className={styles.relationshipInbox}>
          <label>
            <span className={styles.visuallyHidden}>Filter conversations</span>
            <input type="search" placeholder="Filter conversations…" />
          </label>
          {[
            ['Orbit Consulting', 'Referral path is open', 'REFERRAL', 'now'],
            ['Northstar Pay', 'Recipient needs verification', 'ACTION', '2h'],
            ['Signal Ridge', 'Warm introduction mapped', 'WARM', '1d'],
            ['Denmark network', 'Market mismatch recorded', 'SUPPRESS', '8d'],
          ].map(([company, note, state, time], index) => (
            <article className={index === 0 ? styles.selectedThread : undefined} key={company}>
              <span>{company.slice(0, 2).toUpperCase()}</span>
              <div>
                <header>
                  <b>{company}</b>
                  <time>{time}</time>
                </header>
                <p>{note}</p>
                <small>{state}</small>
              </div>
            </article>
          ))}
        </aside>

        <section className={styles.relationshipThread}>
          <header>
            <div>
              <small>Orbit Consulting · consultant network</small>
              <h4>A referral without pressure</h4>
            </div>
            <MiniMark label="REFERRED" />
          </header>
          <div className={styles.timelineRule}>
            <span>13 AUG</span>
          </div>
          <article className={styles.timelineMessage}>
            <header>
              <span>OC</span>
              <div>
                <b>Recruiting partner</b>
                <small>Verified inbound message</small>
              </div>
              <time>09:35</time>
            </header>
            <p>
              “I forwarded your profile to colleagues in another market. Complete the consultant profile so the wider
              team can find you.”
            </p>
            <div className={styles.chipRow}>
              <span>FACT · referral</span>
              <span>FACT · requested action</span>
            </div>
          </article>
          <section className={styles.relationshipComposer}>
            <header>
              <div>
                <small>Next move</small>
                <b>Complete the promised profile first</b>
              </div>
              <span>94 confidence</span>
            </header>
            <p>Do not ask for an update until the action requested by the contact is complete and visible.</p>
            <button type="button">Prepare profile checklist</button>
          </section>
        </section>

        <aside className={styles.accountRail}>
          <section>
            <small>Account</small>
            <h4>Orbit Consulting</h4>
            <p>European consulting network · 2 known markets</p>
            <dl>
              <div>
                <dt>Relationship</dt>
                <dd>Warm referral</dd>
              </div>
              <div>
                <dt>Last signal</dt>
                <dd>17 days ago</dd>
              </div>
              <div>
                <dt>Potential</dt>
                <dd>Contract network</dd>
              </div>
            </dl>
          </section>
          <section className={styles.miniGraph} aria-label="Synthetic relationship graph">
            <div className={styles.graphNodeUser}>You</div>
            <i className={styles.graphLineOne} />
            <div className={styles.graphNodeContact}>Partner</div>
            <i className={styles.graphLineTwo} />
            <div className={styles.graphNodeMarket}>Market</div>
          </section>
          <section className={styles.accountEvidence}>
            <small>Evidence quality</small>
            <ScoreBar value={91} />
            <p>Two direct facts, one unknown. No inferred contact identity.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default function DesignLabPage() {
  return (
    <div className={`page ${styles.page}`}>
      <header className={styles.labHeader}>
        <div>
          <span className="kicker">Synthetic data only · design exploration</span>
          <h1>Three ways to build the opportunity OS.</h1>
          <p>
            Each direction solves a different part of the same system. Compare them before changing the production
            workspace or exposing any private Gmail data.
          </p>
        </div>
        <Link href="/design-audit">Open current design audit →</Link>
      </header>

      <nav className={styles.directionNav} aria-label="Design directions">
        {directions.map((direction) => (
          <a href={`#${direction.id}`} key={direction.id}>
            <span>{direction.number}</span>
            <b>{direction.name}</b>
            <small>{direction.bestFor}</small>
          </a>
        ))}
      </nav>

      <section className={styles.recommendation}>
        <div>
          <span className={styles.recommendationMark}>Recommended</span>
          <h2>Use a hybrid, not one oversized dashboard.</h2>
          <p>
            Keep the Command Center as the home page, make Pipeline Studio the operational workspace, and use
            Relationship Intelligence as the opportunity/company detail view. This preserves speed without flattening
            jobs, B2B work and referrals into the same interaction.
          </p>
        </div>
        <ol>
          <li>
            <span>Home</span>
            One next action
          </li>
          <li>
            <span>Pipeline</span>
            All opportunity lanes
          </li>
          <li>
            <span>360 view</span>
            Evidence + relationships
          </li>
        </ol>
      </section>

      <section className={styles.scorecard} aria-labelledby="scorecard-title">
        <div>
          <span className="kicker">Evaluation matrix</span>
          <h2 id="scorecard-title">Trade-offs made visible</h2>
        </div>
        <div className={styles.scorecardTableWrap} tabIndex={0} aria-label="Design direction scorecard">
          <table>
            <thead>
              <tr>
                <th>Direction</th>
                <th>Decision speed</th>
                <th>Pipeline control</th>
                <th>Relationship depth</th>
                <th>Mobile clarity</th>
              </tr>
            </thead>
            <tbody>
              {directions.map((direction) => (
                <tr key={direction.id}>
                  <td>
                    <b>{direction.name}</b>
                    <small>{direction.summary}</small>
                  </td>
                  {direction.scores.map((score, index) => (
                    <td key={`${direction.id}:${index}`}>
                      <ScoreBar value={score} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.conceptSection} id="command-center">
        <header className={styles.conceptHeader}>
          <span>01</span>
          <div>
            <small>Direction A · low-glare graphite</small>
            <h2>Decision Command Center</h2>
            <p>
              Best when the product must answer “what should I do in the next hour?” without making false EV claims.
            </p>
          </div>
        </header>
        <CommandCenter />
      </section>

      <section className={styles.conceptSection} id="pipeline-studio">
        <header className={styles.conceptHeader}>
          <span>02</span>
          <div>
            <small>Direction B · warm operational paper</small>
            <h2>Pipeline Studio</h2>
            <p>Best for comparing many opportunities, saved views, blockers, stage aging and package readiness.</p>
          </div>
        </header>
        <PipelineStudio />
      </section>

      <section className={styles.conceptSection} id="relationship-intelligence">
        <header className={styles.conceptHeader}>
          <span>03</span>
          <div>
            <small>Direction C · relationship-first midnight</small>
            <h2>Relationship Intelligence</h2>
            <p>Best for warm referrals, B2B accounts, recruiter networks and context-aware follow-up decisions.</p>
          </div>
        </header>
        <RelationshipIntelligence />
      </section>

      <footer className={styles.labFooter}>
        <div>
          <span className="kicker">Design boundary</span>
          <b>No prototype button sends mail, changes data or starts an application.</b>
        </div>
        <a href="#command-center">Back to first concept ↑</a>
      </footer>
    </div>
  );
}
