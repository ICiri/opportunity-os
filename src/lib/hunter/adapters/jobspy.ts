import {z} from 'zod';
import type {RawJob} from '../engine';
import type {HunterSource} from '../registry';
import {absoluteHttpsUrl, fetchJson, plainText, SourceConnectionError} from './common';

const jobSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  site: z.string().optional(),
  job_url: z.string().url(),
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  date_posted: z.string().optional().nullable(),
  job_type: z.string().optional().nullable(),
  min_amount: z.number().optional().nullable(),
  max_amount: z.number().optional().nullable(),
});

function rows(payload: unknown) {
  const candidate = Array.isArray(payload)
    ? payload
    : typeof payload === 'object' && payload !== null && Array.isArray((payload as {jobs?: unknown}).jobs)
      ? (payload as {jobs: unknown[]}).jobs
      : null;
  if (!candidate) throw new SourceConnectionError('JobSpy response does not contain a jobs array.', 'INVALID_PAYLOAD');
  const parsed = z.array(jobSchema).safeParse(candidate);
  if (!parsed.success) throw new SourceConnectionError('JobSpy returned an invalid job payload.', 'INVALID_PAYLOAD');
  return parsed.data;
}

export async function fetchJobSpyJobs(
  source: HunterSource,
  options: {fetchImpl?: typeof fetch; now?: Date; timeoutMs?: number} = {},
): Promise<{jobs: RawJob[]; httpStatus: number; checkedAt: string}> {
  if (source.provider !== 'JOBSPY' || !source.configured || !source.endpoint) {
    throw new SourceConnectionError('JobSpy source is not fully configured.', 'INVALID_CONFIGURATION');
  }
  const endpoint = new URL(source.endpoint);
  if (!['127.0.0.1', 'localhost'].includes(endpoint.hostname)) {
    throw new SourceConnectionError('JobSpy endpoint must stay on loopback.', 'INVALID_CONFIGURATION');
  }
  const checkedAt = (options.now ?? new Date()).toISOString();
  const result = await fetchJson(source.endpoint, options.fetchImpl, options.timeoutMs ?? 30_000);
  const jobs = rows(result.payload).flatMap<RawJob>((job) => {
    const url = absoluteHttpsUrl(job.job_url);
    const title = plainText(job.title);
    const company = plainText(job.company);
    const location = plainText(job.location ?? 'Remote') || 'Remote';
    const externalId = plainText(String(job.id ?? url));
    if (!title || !company || !externalId) return [];
    const published = job.date_posted ? new Date(job.date_posted) : null;
    return [
      {
        sourceId: source.id,
        externalId,
        provider: 'JOBSPY',
        canonicalUrl: url,
        title,
        company,
        location,
        url,
        publishedAt: published && Number.isFinite(published.getTime()) ? published.toISOString() : null,
        sourceUpdatedAt: null,
        verifiedAt: checkedAt,
        description: plainText(`${job.description ?? ''} Job type: ${job.job_type ?? 'unknown'}.`),
        availability: 'LIVE',
        potentialMax: job.max_amount ?? job.min_amount ?? undefined,
      },
    ];
  });
  return {jobs, httpStatus: result.httpStatus, checkedAt};
}
