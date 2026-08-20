'use client';

import {useMemo, useState} from 'react';
import {forecastAll, requiredAccountsForRevenue, scenarios, type ForecastInputs} from '@/lib/planning/forecast';

type Scenario = keyof typeof scenarios;
const euro = (value: number) =>
  new Intl.NumberFormat('en-IE', {style: 'currency', currency: 'EUR', maximumFractionDigits: 0}).format(value);
const controls: {
  key: keyof ForecastInputs;
  label: string;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
}[] = [
  {key: 'weeklyNewAccounts', label: 'New target accounts / week', min: 1, max: 40, step: 1},
  {
    key: 'qualificationRate',
    label: 'Qualification rate',
    min: 0.05,
    max: 0.8,
    step: 0.05,
    format: (value) => `${Math.round(value * 100)}%`,
  },
  {
    key: 'proposalRate',
    label: 'Qualified → proposal',
    min: 0.05,
    max: 0.9,
    step: 0.05,
    format: (value) => `${Math.round(value * 100)}%`,
  },
  {
    key: 'winRate',
    label: 'Proposal → win',
    min: 0.05,
    max: 0.8,
    step: 0.05,
    format: (value) => `${Math.round(value * 100)}%`,
  },
  {key: 'hourlyRate', label: 'Blended hourly rate', min: 30, max: 150, step: 5, format: (value) => `€${value}`},
  {
    key: 'deliveryCapacityHoursWeek',
    label: 'Delivery capacity / week',
    min: 5,
    max: 100,
    step: 5,
    format: (value) => `${value}h`,
  },
];
const templates = [
  {
    type: 'Discovery',
    use: 'Before pitching a new client',
    subject: 'Quick question about [specific workflow]',
    body: 'Hi [Name] — I noticed [verified signal]. How are you currently handling [specific workflow], and where does it create the most delay or operational risk? I am researching this problem with teams in [relevant segment]; no pitch required.',
  },
  {
    type: 'Qualified follow-up',
    use: 'After genuine relevance is confirmed',
    subject: 'One concrete option for [outcome]',
    body: 'Hi [Name] — based on what you shared about [fact], one low-risk option would be [small scoped result]. I can send a one-page outline with scope, evidence and assumptions. Would that be useful, or is this not a priority now?',
  },
  {
    type: 'Referral ask',
    use: 'When the current contact identified another team',
    subject: 'Right owner for [problem]',
    body: 'Hi [Name] — thank you for pointing me toward [team/office]. Would it be easier if I sent a two-line summary you can forward, or would you prefer I contact them directly and mention your referral?',
  },
  {
    type: 'Client value check',
    use: 'During an active engagement',
    subject: 'Next value checkpoint',
    body: 'Hi [Name] — this week we completed [verified result]. The next decision is [decision]. Before proceeding, is there any change in priority, risk or stakeholder expectation that would make a different next step more valuable?',
  },
];

export function BusinessPlanner() {
  const [scenario, setScenario] = useState<Scenario>('base');
  const [input, setInput] = useState<ForecastInputs>(scenarios.base);
  const [target, setTarget] = useState(30000);
  const [copied, setCopied] = useState<string>();
  const points = useMemo(() => forecastAll(input), [input]);
  const annual = points.find((point) => point.days === 365)!;
  const required = requiredAccountsForRevenue(target, input);
  const select = (next: Scenario) => {
    setScenario(next);
    setInput(scenarios[next]);
  };
  const copyTemplate = async (subject: string, body: string) => {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopied(subject);
    } catch {
      setCopied(undefined);
    }
  };

  return (
    <>
      <section className="scenario-bar" aria-label="Forecast scenario">
        {(['conservative', 'base', 'growth'] as Scenario[]).map((item) => (
          <button key={item} aria-pressed={scenario === item} onClick={() => select(item)}>
            {item}
          </button>
        ))}
        <span>Assumption-based · not a guarantee</span>
      </section>
      <div className="planner-grid">
        <section className="forecast-panel">
          <div className="section-head">
            <div>
              <span className="kicker">Capacity-aware forecast</span>
              <h2>Revenue horizons</h2>
            </div>
            <span>Recognized revenue</span>
          </div>
          <div className="forecast-table" role="table" aria-label="Revenue forecast by time horizon">
            <div className="forecast-row header" role="row">
              <span role="columnheader">Horizon</span>
              <span role="columnheader">Accounts</span>
              <span role="columnheader">Expected wins</span>
              <span role="columnheader">Pipeline</span>
              <span role="columnheader">Revenue</span>
              <span role="columnheader">Capacity</span>
            </div>
            {points.map((point) => (
              <div className="forecast-row" role="row" key={point.days}>
                <b role="rowheader">{point.label}</b>
                <span role="cell">{point.accountsContacted}</span>
                <span role="cell">{point.expectedNewClients}</span>
                <span role="cell">{euro(point.expectedPipelineValue)}</span>
                <strong role="cell">{euro(point.expectedRecognizedRevenue)}</strong>
                <span role="cell" className={point.capacityUtilization > 90 ? 'capacity-risk' : ''}>
                  {point.capacityUtilization}%
                </span>
              </div>
            ))}
          </div>
          <p className="model-note">
            Formula: assumed target accounts × qualification × proposal × win probability × engagement value, capped by
            delivery capacity. New engagements are modeled as starting halfway through each horizon.
          </p>
        </section>
        <aside className="assumptions">
          <span className="kicker">Model assumptions</span>
          <h2>Change the levers</h2>
          {controls.map((control) => (
            <label key={control.key}>
              <span>
                {control.label}
                <output>{control.format?.(input[control.key]) ?? input[control.key]}</output>
              </span>
              <input
                type="range"
                min={control.min}
                max={control.max}
                step={control.step}
                value={input[control.key]}
                onChange={(event) => {
                  setScenario('base');
                  setInput({...input, [control.key]: Number(event.target.value)});
                }}
              />
            </label>
          ))}
          <div className="capacity-callout">
            <b>{euro(annual.expectedRecognizedRevenue)}</b>
            <span>1-year modeled revenue</span>
            <small>{annual.capacityUtilization}% of configured delivery capacity</small>
          </div>
        </aside>
      </div>
      <section className="target-planner">
        <div>
          <span className="kicker">Reverse pipeline calculator</span>
          <h2>What does the target require?</h2>
          <p>Uses the full stage conversion, not a motivational guess.</p>
        </div>
        <label>
          Booked revenue target
          <input
            type="number"
            min="1000"
            step="1000"
            value={target}
            onChange={(event) => setTarget(Number(event.target.value))}
          />
        </label>
        <div>
          <strong>{Number.isFinite(required) ? required : '—'}</strong>
          <span>target accounts required</span>
          <small>at current model assumptions</small>
        </div>
      </section>
      <section className="mail-playbook">
        <div className="section-head">
          <div>
            <span className="kicker">Evidence-led outreach</span>
            <h2>Suggested email patterns</h2>
          </div>
          <span>Review required before use</span>
        </div>
        <div>
          {templates.map((template) => (
            <article key={template.type}>
              <span>{template.type}</span>
              <h3>{template.subject}</h3>
              <small>{template.use}</small>
              <p>{template.body}</p>
              <button onClick={() => copyTemplate(template.subject, template.body)}>Copy template</button>
              {copied === template.subject && (
                <small className="copy-status" role="status">
                  Copied to clipboard.
                </small>
              )}
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
