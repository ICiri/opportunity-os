import {loadEnvConfig} from '@next/env';
import {createRun, getRun, type SearchRun} from '../src/lib/hunter/run-store';
import {getSourceRegistry} from '../src/lib/hunter/registry';

loadEnvConfig(process.cwd());

const mode = process.argv[2] ?? 'all';
const terminalStatuses = new Set(['PARTIAL_SUCCESS', 'SUCCESS', 'FAILED', 'AUDIT_FAILED', 'CANCELLED']);

if (mode === 'bounty' || mode === 'company') {
  console.error(
    JSON.stringify(
      {
        mode,
        status: 'FAILED_CLOSED',
        reason:
          mode === 'bounty'
            ? 'No verified bounty catalog adapter is enabled; no testing was performed.'
            : 'No live company-signal adapter is enabled.',
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

if (mode !== 'all' && mode !== 'jobs') {
  console.error(JSON.stringify({mode, status: 'FAILED_CLOSED', reason: 'Unsupported hunter mode.'}, null, 2));
  process.exit(1);
}

async function waitForTerminal(runId: string, timeoutMs = 120_000): Promise<SearchRun> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = getRun(runId);
    if (!run) throw new Error('Hunter run disappeared from the process-local queue.');
    if (terminalStatuses.has(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Hunter run ${runId} did not finish within ${timeoutMs}ms.`);
}

async function main() {
  const startedAt = new Date();
  const queued = createRun({registry: getSourceRegistry(), now: startedAt});
  const run = await waitForTerminal(queued.id);
  console.log(
    JSON.stringify(
      {
        mode,
        runId: run.id,
        startedAt: run.createdAt,
        finishedAt: run.finishedAt,
        status: run.status,
        failureCode: run.failureCode,
        durability: run.durability,
        metrics: run.metrics,
        sources: run.sources,
      },
      null,
      2,
    ),
  );
  process.exitCode =
    (run.status === 'SUCCESS' || run.status === 'PARTIAL_SUCCESS') && run.durability === 'POSTGRES' ? 0 : 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
