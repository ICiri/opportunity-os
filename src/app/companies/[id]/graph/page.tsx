import {notFound} from 'next/navigation';
import {RelationshipGraph} from '@/components/relationship-graph';
import {loadCompany360} from '@/lib/relationships/repository';

export const dynamic = 'force-dynamic';
const LOCAL_USER_ID = process.env.OPPORTUNITY_LOCAL_USER_ID ?? '20000000-0000-4000-8000-000000000001';

export default async function CompanyPage({params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const company = await loadCompany360(LOCAL_USER_ID, id);
  if (!company) notFound();
  const lifecycle = company.lifecycle?.replaceAll('_', ' ') ?? 'NO THREAD STATE';
  return (
    <div className="page">
      <div className="topbar">
        <div>
          <span className="kicker">Persisted Company 360</span>
          <h1>{company.name}</h1>
          <p>Conversation history, current job records and relationship provenance from the local private database.</p>
        </div>
        <span className={`state ${(company.lifecycle ?? 'unknown').toLowerCase()}`}>{lifecycle}</span>
      </div>
      <section className="company-stats" aria-label="Company relationship summary">
        <article>
          <span>Recorded relationship score</span>
          <strong>{company.relationshipScore}</strong>
          <small>Priority metadata, not probability</small>
        </article>
        <article>
          <span>Stored live job records</span>
          <strong>{company.openRoles}</strong>
          <small>Subject to verification TTL</small>
        </article>
        <article>
          <span>Threads</span>
          <strong>{company.threads}</strong>
          <small>{company.messages} persisted messages</small>
        </article>
        <article>
          <span>Country</span>
          <strong>{company.country ?? '—'}</strong>
          <small>Stored company metadata</small>
        </article>
      </section>
      <RelationshipGraph graph={company.graph} compact />
      <section className="history">
        <span className="kicker">Persisted relationship history</span>
        <h2>Continuity before outreach</h2>
        {company.history.map((event) => (
          <div key={`${event.at}:${event.title}`}>
            <time>
              {new Date(event.at)
                .toLocaleDateString('en-GB', {day: '2-digit', month: 'short', timeZone: 'Europe/Zagreb'})
                .toUpperCase()}
            </time>
            <p>
              <b>{event.title}</b>
              <br />
              {event.detail}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
