import {sourceCatalog, sourceCatalogSummary, type SourceState} from '@/data/source-catalog';
import {loadPersistedSourceEvidence, type RuntimeSourceEvidence} from '@/lib/hunter/persistence';

const stateOrder: SourceState[] = [
  'ADAPTER_IMPLEMENTED',
  'READY_TO_BUILD',
  'NEEDS_COMPANY_SEEDS',
  'NEEDS_API_KEY',
  'RESEARCH_ONLY',
];

function checkedAtLabel(value: string | null) {
  if (!value) return 'Never checked';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}

export default async function SourcesPage() {
  let runtimeEvidence: RuntimeSourceEvidence[] = [];
  let evidenceUnavailable = false;
  try {
    runtimeEvidence = await loadPersistedSourceEvidence();
  } catch {
    evidenceUnavailable = true;
  }

  const liveSources = runtimeEvidence.filter((source) => source.state === 'LIVE').length;
  const staleSources = runtimeEvidence.filter((source) => source.state === 'STALE').length;

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <span className="kicker">Research catalog + timestamped runtime evidence</span>
          <h1>Opportunity source coverage</h1>
          <p>
            Catalog state describes what can be built or configured. Only a current persisted successful check is shown
            as LIVE; implemented code alone is never treated as runtime evidence.
          </p>
        </div>
        <div className="planning-status">
          <span>Cataloged sources</span>
          <b>{sourceCatalog.length}</b>
          <small>{sourceCatalogSummary.ADAPTER_IMPLEMENTED} documented adapters implemented</small>
        </div>
      </div>

      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="kicker">Build registry</span>
            <h2>Implementation status</h2>
          </div>
        </div>
        <div className="button-row">
          {stateOrder.map((state) => (
            <span className="state waiting" key={state}>
              {state.replaceAll('_', ' ')}: {sourceCatalogSummary[state]}
            </span>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="kicker">Runtime evidence</span>
            <h2>Latest audited source checks</h2>
          </div>
          <span className="state waiting">
            LIVE {liveSources} · STALE {staleSources}
          </span>
        </div>

        {evidenceUnavailable ? (
          <p>Runtime evidence is unavailable. No source is being presented as live.</p>
        ) : runtimeEvidence.length === 0 ? (
          <p>No persisted audited source check exists yet. Run the official hunter before claiming live coverage.</p>
        ) : (
          <div className="table-wrap" tabIndex={0} aria-label="Latest audited source checks">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Adapter</th>
                  <th>Runtime state</th>
                  <th>Checked at (UTC)</th>
                  <th>HTTP</th>
                  <th>Items</th>
                  <th>Evidence note</th>
                </tr>
              </thead>
              <tbody>
                {runtimeEvidence.map((source) => (
                  <tr key={`${source.runId}:${source.id}`}>
                    <td>{source.name}</td>
                    <td>{source.adapterName ?? 'Research'}</td>
                    <td>{source.state}</td>
                    <td>{checkedAtLabel(source.checkedAt)}</td>
                    <td>{source.httpStatus ?? '—'}</td>
                    <td>{source.itemsSeen}</td>
                    <td>{source.note ?? 'Successful persisted check'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="table-wrap" tabIndex={0} aria-label="Opportunity source implementation catalog">
        <table>
          <thead>
            <tr>
              <th>Tier</th>
              <th>Source</th>
              <th>Type</th>
              <th>Regions</th>
              <th>Remote</th>
              <th>Contract</th>
              <th>Implementation state</th>
            </tr>
          </thead>
          <tbody>
            {[...sourceCatalog]
              .sort((left, right) => left.tier.localeCompare(right.tier) || left.name.localeCompare(right.name))
              .map((source) => (
                <tr key={source.id}>
                  <td>{source.tier}</td>
                  <td>{source.name}</td>
                  <td>{source.kind}</td>
                  <td>{source.regions.join(', ')}</td>
                  <td>{source.remoteSupport ? 'YES' : 'NO'}</td>
                  <td>{source.contractSupport ? 'YES' : 'NO'}</td>
                  <td>{source.state}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
