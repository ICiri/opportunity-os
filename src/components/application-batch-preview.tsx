'use client';

import {useMemo, useState} from 'react';
import type {TargetDecision} from '@/lib/applications/targeting';
import {canEnterApplicationBatch, type RoleFitAnalysis} from '@/lib/cv-agent/role-fit';

type Candidate = {
  id: string;
  company: string;
  title: string;
  location: string;
  url: string;
  applicationKey: string;
  messagePreview: string;
  principles: {id: string; source: string}[];
  target: TargetDecision;
  roleFit: RoleFitAnalysis;
  roleFitOverridden: boolean;
  previouslyContacted: boolean;
};

export function ApplicationBatchPreview({
  candidates,
  initialTrack = 'ADDITIONAL_FREELANCE',
  singleTrack = false,
}: {
  candidates: Candidate[];
  initialTrack?: 'ADDITIONAL_FREELANCE' | 'FULL_TIME';
  singleTrack?: boolean;
}) {
  const [page, setPage] = useState(0);
  const [track, setTrack] = useState<'ADDITIONAL_FREELANCE' | 'FULL_TIME'>(initialTrack);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const trackedCandidates = useMemo(
    () => candidates.filter((candidate) => candidate.target.track === track),
    [candidates, track],
  );
  const pages = Math.max(1, Math.ceil(trackedCandidates.length / 20));
  const visible = useMemo(() => trackedCandidates.slice(page * 20, page * 20 + 20), [trackedCandidates, page]);
  const selectable = visible.filter(
    (candidate) =>
      candidate.target.eligible &&
      canEnterApplicationBatch(candidate.roleFit.decision, candidate.roleFitOverridden) &&
      !candidate.previouslyContacted,
  );
  const selectedVisible = selectable.filter((candidate) => approved.has(candidate.id)).length;
  const allVisibleSelected = selectable.length > 0 && selectedVisible === selectable.length;

  const toggle = (id: string) =>
    setApproved((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleVisible = () =>
    setApproved((current) => {
      const next = new Set(current);
      if (allVisibleSelected) selectable.forEach((candidate) => next.delete(candidate.id));
      else selectable.forEach((candidate) => next.add(candidate.id));
      return next;
    });

  const openSelectedApplications = () => {
    selectable
      .filter((candidate) => approved.has(candidate.id))
      .forEach((candidate) => window.open(candidate.url, '_blank', 'noopener,noreferrer'));
  };

  return (
    <div className="batch-preview">
      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="kicker">Hard limit: 20</span>
            <h2>Application batch {page + 1}</h2>
          </div>
          <strong>{selectedVisible} approved in this batch</strong>
        </div>
        <p>
          Additional / Freelance accepts remote B2B, contract, consulting and freelance roles even when weekly hours are
          not stated or exceed your preferred allocation. Hours remain visible for negotiation, not as an application
          blocker. Full-time opportunities are kept in a separate review queue. Verified recipients, Gmail deduplication
          and reviewed CVs are still required before delivery.
        </p>
        {!singleTrack && (
          <div className="button-row" aria-label="Application track">
            <button
              className={track === 'ADDITIONAL_FREELANCE' ? 'primary-control' : undefined}
              onClick={() => {
                setTrack('ADDITIONAL_FREELANCE');
                setPage(0);
              }}
            >
              Additional / Freelance (
              {candidates.filter((candidate) => candidate.target.track === 'ADDITIONAL_FREELANCE').length})
            </button>
            <button
              className={track === 'FULL_TIME' ? 'primary-control' : undefined}
              onClick={() => {
                setTrack('FULL_TIME');
                setPage(0);
              }}
            >
              Full-time ({candidates.filter((candidate) => candidate.target.track === 'FULL_TIME').length})
            </button>
          </div>
        )}
        <div className="button-row">
          <button disabled={page === 0} onClick={() => setPage((value) => value - 1)}>
            Previous 20
          </button>
          <button disabled={page + 1 >= pages} onClick={() => setPage((value) => value + 1)}>
            Next 20
          </button>
          <button className="primary-control" disabled={selectedVisible === 0} onClick={openSelectedApplications}>
            Open selected applications ({selectedVisible}/20)
          </button>
        </div>
        <label>
          <input
            type="checkbox"
            checked={allVisibleSelected}
            disabled={selectable.length === 0}
            onChange={toggleVisible}
          />{' '}
          Select all eligible in this batch ({selectedVisible}/{selectable.length})
        </label>
      </section>

      <div className="opportunity-grid">
        {visible.map((candidate) => {
          const blocked =
            !candidate.target.eligible ||
            !canEnterApplicationBatch(candidate.roleFit.decision, candidate.roleFitOverridden) ||
            candidate.previouslyContacted;
          return (
            <article className="opportunity-card" key={candidate.applicationKey}>
              <div>
                <span className={`state ${blocked ? 'waiting' : 'referred'}`}>{blocked ? 'BLOCKED' : 'REVIEW'}</span>
                <strong>
                  {candidate.target.weeklyHours ? `${candidate.target.weeklyHours} h/week` : 'hours unknown'}
                </strong>
              </div>
              <h2>{candidate.title}</h2>
              <span className="kicker">{candidate.target.track.replaceAll('_', ' ')}</span>
              <p>
                {candidate.company} · {candidate.location}
              </p>
              {candidate.previouslyContacted && <p className="error">Gmail snapshot: company was already contacted.</p>}
              {candidate.target.reasons.length > 0 && <small>{candidate.target.reasons.join(' · ')}</small>}
              <p>
                <b>CV decision:</b> {candidate.roleFit.decision} · Technical adjacency{' '}
                {candidate.roleFit.technicalAdjacency}
              </p>
              <p>
                <b>Evidence score:</b> {candidate.roleFit.cvScore}/100 · Opportunity score{' '}
                {candidate.roleFit.opportunityScore}/100
              </p>
              {candidate.roleFit.hardGaps.length > 0 && (
                <small>Hard gaps: {candidate.roleFit.hardGaps.join(' · ')}</small>
              )}
              {candidate.roleFitOverridden && <small>Audited human override recorded for this exact analysis.</small>}

              <details>
                <summary>1. Preview job advertisement</summary>
                <p>Open the exact persisted source listing and verify hours, contract type and location eligibility.</p>
                <a href={candidate.url} target="_blank" rel="noreferrer">
                  Open source advertisement ↗
                </a>
              </details>
              <details>
                <summary>2. Preview tailored message</summary>
                <p style={{whiteSpace: 'pre-line'}}>{candidate.messagePreview}</p>
                <p>
                  <b>Conversation framework:</b> {candidate.principles.map((item) => item.source).join(' · ')}
                </p>
                <small>Deterministic preview only. Recipient is not yet verified and nothing was sent.</small>
              </details>
              <details>
                <summary>3. Preview tailored CV</summary>
                <a href={`/cv-studio?opportunity=${candidate.id}&language=en`}>Open source-linked CV preview →</a>
                <small>Only APPROVED MASTER_EN facts with matching source hash are allowed.</small>
              </details>

              <a className="primary-link" href={candidate.url} target="_blank" rel="noreferrer">
                Apply now on official site <span>↗</span>
              </a>

              <label>
                <input
                  type="checkbox"
                  checked={approved.has(candidate.id)}
                  disabled={blocked}
                  onChange={() => toggle(candidate.id)}
                />{' '}
                I reviewed the advertisement, message and CV
              </label>
            </article>
          );
        })}
      </div>
    </div>
  );
}
