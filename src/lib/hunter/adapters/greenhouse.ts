import {z} from 'zod';
import type {RawJob} from '../engine';
import type {HunterSource} from '../registry';
import {absoluteHttpsUrl, fetchJson, plainText, SourceConnectionError} from './common';

const greenhousePayload = z.object({
  jobs: z
    .array(
      z.object({
        id: z.union([z.number(), z.string()]),
        internal_job_id: z.union([z.number(), z.string()]).nullable().optional(),
        title: z.string().min(1),
        updated_at: z.string().min(1),
        absolute_url: z.string().url(),
        location: z.object({name: z.string().optional()}).optional(),
        content: z.string().optional(),
      }),
    )
    .max(20_000),
});

export async function fetchGreenhouseJobs(
  source: HunterSource,
  options: {fetchImpl?: typeof fetch; now?: Date; timeoutMs?: number} = {},
): Promise<{jobs: RawJob[]; httpStatus: number; checkedAt: string}> {
  if (source.provider !== 'GREENHOUSE' || !source.configured || !source.endpoint || !source.company) {
    throw new SourceConnectionError('Greenhouse source is not fully configured.', 'INVALID_CONFIGURATION');
  }
  const checkedAt = (options.now ?? new Date()).toISOString();
  const response = await fetchJson(source.endpoint, options.fetchImpl, options.timeoutMs);
  const parsed = greenhousePayload.safeParse(response.payload);
  if (!parsed.success) {
    throw new SourceConnectionError(
      `Greenhouse payload failed validation: ${parsed.error.issues[0]?.message ?? 'unknown error'}`,
      'INVALID_PAYLOAD',
      response.httpStatus,
    );
  }
  const jobs = parsed.data.jobs
    .filter((job) => job.internal_job_id !== null)
    .map<RawJob>((job) => ({
      sourceId: source.id,
      externalId: String(job.id),
      provider: 'GREENHOUSE',
      requisitionId: job.internal_job_id === undefined ? undefined : String(job.internal_job_id),
      canonicalUrl: absoluteHttpsUrl(job.absolute_url),
      title: job.title.trim(),
      company: source.company as string,
      location: job.location?.name?.trim() || 'Location not specified',
      url: absoluteHttpsUrl(job.absolute_url),
      publishedAt: null,
      sourceUpdatedAt: new Date(job.updated_at).toISOString(),
      verifiedAt: checkedAt,
      description: plainText(job.content),
      availability: 'LIVE',
    }));
  return {jobs, httpStatus: response.httpStatus, checkedAt};
}
