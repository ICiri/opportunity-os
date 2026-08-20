import {bountyPrograms} from '@/data/bounties';
export default function BountiesPage() {
  return (
    <div className="page">
      <div className="topbar">
        <div>
          <span className="kicker">Directory-only · no live adapter</span>
          <h1>Bounties</h1>
          <p>
            Saved links to official directories and safety guidance, separated from remote jobs. Freshness, enrollment
            and program scope are not verified in this app.
          </p>
        </div>
      </div>
      <div className="bounty-grid">
        {bountyPrograms.map((item) => (
          <article key={item.id}>
            <div>
              <span className="state reactivate">{item.authorization.replaceAll('_', ' ')}</span>
              <b>{item.platform}</b>
            </div>
            <h2>{item.name}</h2>
            <p>{item.nextStep}</p>
            <dl>
              <dt>Reward</dt>
              <dd>{item.reward}</dd>
              <dt>Safe harbor</dt>
              <dd>{item.safeHarbor}</dd>
            </dl>
            <a href={item.sourceUrl} target="_blank" rel="noreferrer">
              Open official program source ↗
            </a>
          </article>
        ))}
      </div>
      <section className="integrity-note">
        <span>!</span>
        <div>
          <b>Directory is not authorization</b>
          <p>
            No executor is connected. Before any future test, open the current program brief and independently verify
            the exact asset, method, account and scope version.
          </p>
        </div>
      </section>
    </div>
  );
}
