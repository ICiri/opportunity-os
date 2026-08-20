import {performance} from 'node:perf_hooks';
import {ingest, type RawJob} from '../src/lib/hunter/engine';

const total = 100_000;
const unique = 80_000;
const beforeHeap = process.memoryUsage().heapUsed;
const records: RawJob[] = Array.from({length: total}, (_, index) => {
  const canonical = index % unique;
  return {
    sourceId: `source-${index % 8}`,
    externalId: `external-${index}`,
    title: `Backend Engineer ${canonical}`,
    company: `Company ${canonical}`,
    location: 'EU Remote',
    url: `https://example.test/jobs/${index}`,
    publishedAt: '2026-08-16T00:00:00.000Z',
    description: 'EU remote B2B contract for payments and API integration.',
    potentialMax: 20_000,
    probability: 25,
    effortHours: 10,
  };
});

const started = performance.now();
const result = ingest(records);
const durationMs = Math.round(performance.now() - started);
const heapDeltaMb = Math.round((process.memoryUsage().heapUsed - beforeHeap) / 1024 / 1024);
const failures: string[] = [];
if (result.seen !== total) failures.push(`seen:${result.seen}`);
if (result.created !== unique) failures.push(`created:${result.created}`);
if (result.duplicates !== total - unique) failures.push(`duplicates:${result.duplicates}`);
if (result.jobs.length !== unique) failures.push(`jobs:${result.jobs.length}`);
if (durationMs > 15_000) failures.push(`durationMs:${durationMs}`);
if (heapDeltaMb > 768) failures.push(`heapDeltaMb:${heapDeltaMb}`);

console.log(
  JSON.stringify(
    {
      status: failures.length ? 'FAIL' : 'PASS',
      total,
      unique,
      duplicates: result.duplicates,
      durationMs,
      recordsPerSecond: Math.round(total / (durationMs / 1000)),
      heapDeltaMb,
      limits: {durationMs: 15_000, heapDeltaMb: 768},
      failures,
    },
    null,
    2,
  ),
);
process.exitCode = failures.length ? 1 : 0;
