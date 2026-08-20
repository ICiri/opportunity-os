import {bountyPrograms} from '@/data/bounties';
export default function BountiesPage() {
  return (
    <div className="page">
      <div className="topbar">
        <div>
          <span className="kicker">Security and paid software work</span>
          <h1>All bounty opportunities</h1>
          <p>
            Visible directories for paid open-source development and authorized security research. Freshness, claim
            status, enrollment and exact scope must be verified on the official source.
          </p>
        </div>
      </div>
      <div className="bounty-grid">
        {bountyPrograms.map((item) => (
          <article key={item.id}>
            <div>
              <span className="state reactivate">{item.authorization.replaceAll('_', ' ')}</span>
              <b>
                {item.category.replaceAll('_', ' ')} · {item.platform}
              </b>
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
