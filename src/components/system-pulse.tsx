'use client';
import {useEffect, useState} from 'react';

type Health = {
  status: 'HEALTHY' | 'DEGRADED';
  database?: {status: 'CONNECTED' | 'DISCONNECTED'; tables: number; conversations: number; latencyMs: number};
};

export function SystemPulse() {
  const [health, setHealth] = useState<Health>();
  useEffect(() => {
    fetch('/api/health', {cache: 'no-store'})
      .then((r) => r.json())
      .then(setHealth)
      .catch(() =>
        setHealth({status: 'DEGRADED', database: {status: 'DISCONNECTED', tables: 0, conversations: 0, latencyMs: 0}}),
      );
  }, []);
  const connected = health?.database?.status === 'CONNECTED';
  const pending = !health;
  return (
    <div className="sidebar-foot">
      <span className={connected ? 'health-dot' : 'health-dot degraded'} />
      {pending ? 'Checking local database' : connected ? 'Local database connected' : 'Database disconnected'}
      <small>
        {pending
          ? 'Awaiting live health response'
          : connected
            ? `${health.database?.tables} tables · ${health.database?.conversations} persisted threads · ${health.database?.latencyMs}ms`
            : 'No live database connection'}
      </small>
    </div>
  );
}
