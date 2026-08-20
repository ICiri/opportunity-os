import Link from 'next/link';
import {RelationshipGraph} from '@/components/relationship-graph';
import {emptyRelationshipGraph} from '@/lib/relationships/graph';
import {loadRelationshipGaps, loadRelationshipGraph} from '@/lib/relationships/repository';

export const dynamic = 'force-dynamic';
const LOCAL_USER_ID = process.env.OPPORTUNITY_LOCAL_USER_ID ?? '20000000-0000-4000-8000-000000000001';

export default async function RelationshipsPage() {
  const [graph, gaps] = await Promise.all([loadRelationshipGraph(LOCAL_USER_ID), loadRelationshipGaps(LOCAL_USER_ID)]);
  return (
    <div className="page">
      <div className="topbar">
        <div>
          <span className="kicker">Persisted relationship intelligence</span>
          <h1>Paths, not contact lists.</h1>
          <p>
            Nodes come from stored Gmail metadata. Company association is marked as inference; unknown paths are never
            promoted to facts.
          </p>
        </div>
      </div>
      <RelationshipGraph graph={graph ?? emptyRelationshipGraph()} />
      <section className="gap-list">
        <h2>Open relationship gaps</h2>
        {gaps === null && (
          <article>
            <span>!</span>
            <div>
              <b>Relationship database is disconnected</b>
              <p>No sample gaps are displayed.</p>
            </div>
            <em>CONNECT</em>
          </article>
        )}
        {gaps?.length === 0 && (
          <article>
            <span>—</span>
            <div>
              <b>No persisted referral or delivery gap</b>
              <p>This means none is recorded, not that every relationship is complete.</p>
            </div>
            <em>REVIEW</em>
          </article>
        )}
        {gaps?.map((gap, index) => (
          <article key={gap.id}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <div>
              <b>{gap.title}</b>
              <p>{gap.detail}</p>
            </div>
            <em>
              <Link href={`/conversations/${gap.id}`}>{gap.action}</Link>
            </em>
          </article>
        ))}
      </section>
    </div>
  );
}
