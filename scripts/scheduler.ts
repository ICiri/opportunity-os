import {CLOUDFLARE_CRON_CANDIDATES, zagrebScheduleDecision} from '../src/lib/hunter/schedule';

const probes = [
  '2026-08-16T09:00:00.000Z',
  '2026-08-16T10:00:00.000Z',
  '2026-12-16T09:00:00.000Z',
  '2026-12-16T10:00:00.000Z',
].map((instant) => ({instant, ...zagrebScheduleDecision(new Date(instant))}));

const failures = probes.filter((probe) => {
  const expected = probe.instant === '2026-08-16T09:00:00.000Z' || probe.instant === '2026-12-16T10:00:00.000Z';
  return probe.due !== expected;
});

console.log(
  JSON.stringify(
    {
      status: failures.length === 0 ? 'PASS' : 'FAIL',
      timezone: 'Europe/Zagreb',
      localTime: '11:00',
      cloudflareUtcCandidates: CLOUDFLARE_CRON_CANDIDATES,
      deploymentStatus: 'SCAFFOLD_ONLY_NOT_DEPLOYED',
      probes,
      failures,
    },
    null,
    2,
  ),
);
process.exitCode = failures.length === 0 ? 0 : 1;
