'use client';
import {useEffect, useRef, useState, type ReactNode} from 'react';
import Link from 'next/link';
import type {ConversationRecord} from '@/lib/conversation/types';
import type {MailMessageSnapshot, MailThreadSnapshot} from '@/data/mailbox-types';
import {buildSuggestion, evidenceChain} from '@/lib/conversation/strategy';
import {RelationshipGraph} from './relationship-graph';
import type {RelationshipGraphModel} from '@/lib/relationships/graph';

type Tab = 'timeline' | 'audit' | 'graph';
function Drawer({
  titleId,
  label,
  onClose,
  children,
  wide = false,
}: {
  titleId: string;
  label: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const drawer = useRef<HTMLElement>(null);
  useEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawer.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !drawer.current) return;
      const f = [
        ...drawer.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (!f.length) return;
      if (event.shiftKey && document.activeElement === f[0]) {
        event.preventDefault();
        f.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === f.at(-1)) {
        event.preventDefault();
        f[0].focus();
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = overflow;
      returnFocus?.focus();
    };
  }, [onClose]);
  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside
        ref={drawer}
        className={`drawer${wide ? ' drawer-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <button className="close" onClick={onClose} aria-label={`Close ${label}`}>
          ×
        </button>
        {children}
      </aside>
    </div>
  );
}
const labelFor = (message: MailMessageSnapshot) =>
  message.role === 'SENT_EMAIL' ? 'Sent email' : message.role === 'MY_LAST_EMAIL' ? 'My last email' : 'Received reply';
const initials = (value: string) =>
  value
    .replace(/[<"].*$/, '')
    .trim()
    .split(/\s+/)
    .map((x) => x[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '—';
export function ConversationWorkspace({
  conversation,
  thread,
  graph,
}: {
  conversation: ConversationRecord;
  thread?: MailThreadSnapshot;
  graph: RelationshipGraphModel;
}) {
  const suggestion = buildSuggestion(conversation, thread),
    chain = evidenceChain(conversation),
    messages = thread?.messages || [];
  const [tab, setTab] = useState<Tab>('timeline'),
    [why, setWhy] = useState(false),
    [review, setReview] = useState(false),
    [cvPreview, setCvPreview] = useState(false),
    [approved, setApproved] = useState(false),
    [approvedLocally, setApprovedLocally] = useState(false),
    [copied, setCopied] = useState(false),
    [reviewDraft, setReviewDraft] = useState(suggestion.draft ?? '');
  return (
    <>
      <div className="conversation-tabs" role="tablist" aria-label="Conversation views">
        {(['timeline', 'audit', 'graph'] as Tab[]).map((item) => (
          <button
            id={`${item}-tab`}
            key={item}
            role="tab"
            aria-selected={tab === item}
            aria-controls={`${item}-panel`}
            tabIndex={tab === item ? 0 : -1}
            onClick={() => setTab(item)}
          >
            {item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>
      {tab === 'timeline' && (
        <div className="conversation-layout" role="tabpanel" id="timeline-panel" aria-labelledby="timeline-tab">
          <section className="thread" aria-label="Message timeline">
            <div className="thread-toolbar">
              <span>
                <b>{messages.length || conversation.messageCount} messages</b>
                <small>Oldest → newest · read-only Gmail capture</small>
              </span>
              {thread && (
                <a href={thread.gmailUrl} target="_blank" rel="noreferrer">
                  Open full thread in Gmail ↗
                </a>
              )}
            </div>
            {messages.length ? (
              messages.map((message, index) => (
                <article
                  className={`message ${message.direction === 'INBOUND' ? 'inbound' : 'outbound'}`}
                  key={message.id}
                >
                  <div className="message-role">
                    <span>{index + 1}</span>
                    <b>{labelFor(message)}</b>
                  </div>
                  <header>
                    <span className={`avatar${message.direction === 'INBOUND' ? ' contact' : ''}`}>
                      {initials(message.from)}
                    </span>
                    <div>
                      <b>{message.from.replace(/<.*>/, '').replaceAll('"', '').trim()}</b>
                      <small>to {message.to.replace(/<.*>/, '').trim()}</small>
                    </div>
                    <time>{message.sentAt}</time>
                  </header>
                  <h3>{message.subject}</h3>
                  <p className="mail-body">{message.body}</p>
                  {message.attachments.map((file, attachmentIndex) => (
                    <div className="attachment-card" key={`${message.id}:${file.filename}:${attachmentIndex}`}>
                      <span>PDF</span>
                      <div>
                        <b>{file.filename}</b>
                        <small>
                          {Math.max(1, Math.round(file.sizeBytes / 1024))} KB · attached to{' '}
                          {labelFor(message).toLowerCase()}
                        </small>
                      </div>
                      <button onClick={() => setCvPreview(true)}>Preview CV template</button>
                      {thread && (
                        <a href={thread.gmailUrl} target="_blank" rel="noreferrer">
                          Open original ↗
                        </a>
                      )}
                    </div>
                  ))}
                </article>
              ))
            ) : (
              <article className="message">
                <p>
                  The Gmail snapshot for this record is unavailable. Open the source mailbox and verify before taking
                  action.
                </p>
              </article>
            )}
          </section>
          <aside className="strategy">
            <div className="panel-head">
              <div>
                <span className="kicker">Recommended action</span>
                <h2>{conversation.state.replaceAll('_', ' ')}</h2>
              </div>
              <span className="confidence">{conversation.evidence.length} evidence items</span>
            </div>
            <p className="action-copy">{conversation.nextAction}</p>
            <button className="why-button" onClick={() => setWhy(true)}>
              Why this action? <span>→</span>
            </button>
            <div className="evidence-list">
              {conversation.evidence.map((item, index) => (
                <div key={index}>
                  <span className={item.kind.toLowerCase()}>{item.kind}</span>
                  <p>{item.text}</p>
                  <small>{item.source}</small>
                </div>
              ))}
            </div>
            {suggestion.draft && (
              <div className="draft-card">
                <span className="kicker">Suggested reply · never auto-sent</span>
                <p>{suggestion.draft}</p>
                <button onClick={() => setReview(true)}>Review message</button>
                {approvedLocally && (
                  <small className="approval-status" role="status">
                    Approved locally. No email was sent.
                  </small>
                )}
              </div>
            )}
            <Link className="secondary-button cv-action" href="/cv-studio">
              Generate a new CV →
            </Link>
          </aside>
        </div>
      )}
      {tab === 'audit' && (
        <section className="audit-grid" role="tabpanel" id="audit-panel" aria-labelledby="audit-tab">
          {suggestion.principles.map((principle) => (
            <article key={principle.id}>
              <span>GUIDANCE</span>
              <h3>{principle.id.replaceAll('_', ' ')}</h3>
              <p>{principle.application} This is a design lens, not proof of effectiveness.</p>
            </article>
          ))}
          <article>
            <span>CHECK</span>
            <h3>Risks</h3>
            <p>{suggestion.risks.join(' ')}</p>
          </article>
        </section>
      )}
      {tab === 'graph' && (
        <div role="tabpanel" id="graph-panel" aria-labelledby="graph-tab">
          <RelationshipGraph graph={graph} />
        </div>
      )}
      {why && (
        <Drawer titleId="why-title" label="explanation" onClose={() => setWhy(false)}>
          <span className="kicker">Explainable recommendation</span>
          <h2 id="why-title">Why this action?</h2>
          {Object.entries(chain).map(([key, value], index) => (
            <div className="reason-step" key={key}>
              <span>{index + 1}</span>
              <div>
                <small>{key.replaceAll('_', ' ')}</small>
                <p>{value}</p>
              </div>
            </div>
          ))}
        </Drawer>
      )}
      {review && (
        <Drawer titleId="review-title" label="message review" onClose={() => setReview(false)}>
          <span className="kicker">Human approval required</span>
          <h2 id="review-title">Review suggested message</h2>
          <textarea
            aria-label="Suggested email draft"
            value={reviewDraft}
            onChange={(event) => {
              setReviewDraft(event.target.value);
              setApproved(false);
              setCopied(false);
            }}
          />
          <label className="approval">
            <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} /> I verified
            recipients, claims, attachment and timing.
          </label>
          <button
            className="drawer-primary"
            disabled={!approved || !reviewDraft.trim()}
            onClick={() => {
              setApprovedLocally(true);
              setReview(false);
            }}
          >
            Approve locally
          </button>
          <button
            className="copy-button"
            disabled={!reviewDraft.trim()}
            onClick={async () => {
              await navigator.clipboard.writeText(reviewDraft);
              setCopied(true);
            }}
          >
            Copy edited message
          </button>
          {copied && (
            <p className="copy-status" role="status">
              Edited text copied. Nothing was sent.
            </p>
          )}
          {thread && (
            <a className="secondary-button gmail-action" href={thread.gmailUrl} target="_blank" rel="noreferrer">
              Open Gmail thread ↗
            </a>
          )}
          <p className="safe-note">
            The draft uses only the real thread’s recipient, subject and message direction; it does not infer role fit
            or availability. The local site has no Gmail OAuth sending credential. Sending remains an explicit action in
            Gmail.
          </p>
        </Drawer>
      )}
      {cvPreview && (
        <Drawer titleId="cv-title" label="CV preview" onClose={() => setCvPreview(false)} wide>
          <span className="kicker">Supplied source template</span>
          <h2 id="cv-title">CV preview</h2>
          <div className="preview-actions">
            <a href="/api/cv-files/english" target="_blank">
              Open English PDF ↗
            </a>
            <a href="/api/cv-files/croatian" target="_blank">
              Open Croatian PDF ↗
            </a>
            <Link href="/cv-studio">Generate tailored CV →</Link>
          </div>
          <iframe className="pdf-preview" src="/api/cv-files/english" title="English CV PDF preview" />
          <p className="safe-note">
            This preview is the supplied English master template. Use “Open original” on the attachment card to inspect
            the exact role-specific file in Gmail.
          </p>
        </Drawer>
      )}
    </>
  );
}
