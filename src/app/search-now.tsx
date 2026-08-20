'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';

type Run = {
  id: string;
  status: string;
  failureCode?: string;
  progress: number;
  seen: number;
  created: number;
  duplicates: number;
  metrics?: {
    sourceCoverage: number;
    liveSources: number;
    runnableSources: number;
    eligibleJobs: number;
    likelyEligibleJobs: number;
  };
};

export function SearchNow({label = 'SEARCH NOW'}: {label?: string}) {
  const router = useRouter();
  const [run, setRun] = useState<Run>();
  const [error, setError] = useState('');
  const search = async () => {
    setError('');
    try {
      const response = await fetch('/api/search-runs', {method: 'POST'});
      if (response.status === 429) throw new Error('Search limit reached. Try again shortly.');
      if (!response.ok) throw new Error('Live source check could not be started.');
      const queued = (await response.json()) as Run;
      setRun(queued);
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const currentResponse = await fetch(`/api/search-runs/${queued.id}`, {cache: 'no-store'});
        if (!currentResponse.ok) throw new Error('Search status is unavailable.');
        const current = (await currentResponse.json()) as Run;
        setRun(current);
        if (['SUCCESS', 'PARTIAL_SUCCESS', 'FAILED', 'AUDIT_FAILED', 'CANCELLED'].includes(current.status)) {
          router.refresh();
          break;
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Search failed.');
    }
  };
  const busy = run?.status === 'RUNNING' || run?.status === 'QUEUED';
  return (
    <div className="search-control">
      <button onClick={search} disabled={busy}>
        {busy ? 'CHECKING LIVE SOURCES…' : label}
      </button>
      {run && (
        <div className="run-chip" aria-live="polite">
          <span>{run.status}</span>
          <small>
            {run.metrics
              ? `${run.metrics.sourceCoverage}% source coverage of configured runnable sources · ${run.metrics.liveSources}/${run.metrics.runnableSources} live · ${run.seen} seen · ${run.metrics.eligibleJobs + run.metrics.likelyEligibleJobs} eligible/likely`
              : `${run.progress}% · ${run.seen} seen · ${run.created} created · ${run.duplicates} merged`}
          </small>
          {run.failureCode && <small className="error">{run.failureCode.replaceAll('_', ' ')}</small>}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
