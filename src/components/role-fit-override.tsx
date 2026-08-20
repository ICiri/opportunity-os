'use client';
import {useState} from 'react';

export function RoleFitOverride({
  jobPostingId,
  analysisHash,
  gaps,
}: {
  jobPostingId: string;
  analysisHash: string;
  gaps: string[];
}) {
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [status, setStatus] = useState('');
  const submit = async () => {
    setStatus('Saving immutable override…');
    const response = await fetch('/api/cv-role-fit-overrides', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({jobPostingId, analysisHash, reason, acknowledgedGaps: gaps}),
    });
    const body = (await response.json()) as {error?: string};
    if (!response.ok) {
      setStatus(body.error ?? 'Override failed.');
      return;
    }
    setStatus('Override recorded. Reloading role-fit decision…');
    window.location.reload();
  };
  return (
    <div className="panel">
      <h3>Audited human override</h3>
      <p>This does not remove gaps. It records that you reviewed and accepted them for this exact analysis hash.</p>
      <textarea
        aria-label="Override reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Why is preparing this borderline application justified?"
      />
      <label>
        <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /> I
        acknowledge every listed hard gap.
      </label>
      <button disabled={!acknowledged || reason.trim().length < 12 || gaps.length === 0} onClick={submit}>
        Record immutable override
      </button>
      {status && <p role="status">{status}</p>}
    </div>
  );
}
