import Link from 'next/link';
import {notFound} from 'next/navigation';
import {ConversationWorkspace} from '@/components/conversation-workspace';
import {getPersistedConversation} from '@/lib/conversation/repository';
import {emptyRelationshipGraph} from '@/lib/relationships/graph';
import {loadRelationshipGraph} from '@/lib/relationships/repository';

export const dynamic = 'force-dynamic';
const LOCAL_USER_ID = process.env.OPPORTUNITY_LOCAL_USER_ID ?? '20000000-0000-4000-8000-000000000001';

export default async function ConversationPage({params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const [workspace, graph] = await Promise.all([
    getPersistedConversation(LOCAL_USER_ID, id),
    loadRelationshipGraph(LOCAL_USER_ID, {threadId: id}),
  ]);
  if (!workspace) notFound();
  const {conversation, thread} = workspace;
  return (
    <div className="page">
      <div className="topbar">
        <div>
          <span className="kicker">Persisted conversation intelligence</span>
          <h1>{conversation.company}</h1>
          <p>{conversation.subject}</p>
        </div>
        <div className="top-actions">
          <Link href="/conversations" className="secondary-button">
            ← All conversations
          </Link>
          <span className={`state ${conversation.state.toLowerCase()}`}>{conversation.state.replaceAll('_', ' ')}</span>
        </div>
      </div>
      <ConversationWorkspace conversation={conversation} thread={thread} graph={graph ?? emptyRelationshipGraph()} />
    </div>
  );
}
