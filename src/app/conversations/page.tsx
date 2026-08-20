import Link from 'next/link';
import {listPersistedConversations} from '@/lib/conversation/repository';
import {getPrivateMailThreadSummaries} from '@/lib/gmail/repository';

export const dynamic = 'force-dynamic';
const LOCAL_USER_ID = process.env.OPPORTUNITY_LOCAL_USER_ID ?? '20000000-0000-4000-8000-000000000001';

export default async function ConversationsPage() {
  const [recordsResult, summariesResult] = await Promise.allSettled([
    listPersistedConversations(LOCAL_USER_ID),
    getPrivateMailThreadSummaries(LOCAL_USER_ID),
  ]);
  const records = recordsResult.status === 'fulfilled' ? recordsResult.value : null;
  const summaries = summariesResult.status === 'fulfilled' ? summariesResult.value : {};
  const connected = records !== null && records.length > 0 && Object.keys(summaries).length > 0;
  const ordered = connected ? records : [];
  const replied = ordered.filter(
    (conversation) => conversation.state !== 'DELIVERY_FAILURE' && (summaries[conversation.id]?.inbound ?? 0) > 0,
  ).length;
  const attachments = ordered.reduce((sum, conversation) => sum + (summaries[conversation.id]?.pdfs ?? 0), 0);

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <span className="kicker">Private Gmail conversation ledger</span>
          <h1>Conversations</h1>
          <p>
            Only threads present in the real private database are listed. Message bodies decrypt server-side and every
            future message remains human-controlled.
          </p>
        </div>
        <span className={`state ${connected ? 'warm_relationship' : 'delivery_failure'}`}>
          {connected ? 'PRIVATE DB CONNECTED' : 'MAILBOX DISCONNECTED'}
        </span>
      </div>
      <section className="metric-strip">
        <article>
          <span>Tracked threads</span>
          <strong>{ordered.length}</strong>
          <small>Joined to persisted Gmail messages</small>
        </article>
        <article>
          <span>Threads with inbound mail</span>
          <strong>{replied}</strong>
          <small>Inbound observed; human/automatic not classified</small>
        </article>
        <article>
          <span>CV attachments</span>
          <strong>{attachments}</strong>
          <small>Original persisted filenames</small>
        </article>
        <article>
          <span>Automatic sends</span>
          <strong>0</strong>
          <small>Human approval required</small>
        </article>
      </section>
      {!connected && (
        <section className="empty-state">
          <h2>Gmail data is not connected</h2>
          <p>
            No static or sample conversation is being shown. Connect the private database and import Gmail before
            reviewing or drafting a reply.
          </p>
        </section>
      )}
      {connected && (
        <div className="conversation-ledger">
          <div className="ledger-row ledger-head">
            <span>Company / contact</span>
            <span>Flow</span>
            <span>CV</span>
            <span>Recorded next action</span>
          </div>
          {ordered.map((conversation) => {
            const thread = summaries[conversation.id];
            const inbound = thread?.inbound ?? 0;
            const pdfs = thread?.pdfs ?? 0;
            return (
              <Link className="ledger-row" href={`/conversations/${conversation.id}`} key={conversation.id}>
                <span>
                  <b>{conversation.company}</b>
                  <small>
                    {conversation.contact} · {conversation.country}
                  </small>
                </span>
                <span>
                  <b>{thread?.messages ?? conversation.messageCount} messages</b>
                  <small>{inbound ? `${inbound} inbound` : 'Outbound · waiting'}</small>
                </span>
                <span>
                  <b>{pdfs ? `${pdfs} PDF` : 'No PDF found'}</b>
                  <small>{thread?.firstPdf ?? 'Open thread to verify'}</small>
                </span>
                <span>
                  <b>{conversation.state.replaceAll('_', ' ')}</b>
                  <small>{conversation.nextAction}</small>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
