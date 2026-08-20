import {z} from 'zod';
import type {RawJob} from '../engine';
import type {HunterSource} from '../registry';
import {absoluteHttpsUrl, fetchJson, plainText, SourceConnectionError} from './common';

const ashbyPayload = z.object({
  jobs: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        location: z.string().optional(),
        descriptionHtml: z.string().optional(),
        descriptionPlain: z.string().optional(),
        jobUrl: z.string().url(),
        applyUrl: z.string().url().optional(),
        publishedAt: z.string().optional(),
        employmentType: z.string().optional(),
        workplaceType: z.string().optional(),
      }),
    )
    .max(20_000),
});

function validDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export async function fetchAshbyJobs(
  source: HunterSource,
  options: {fetchImpl?: typeof fetch; now?: Date; timeoutMs?: number} = {},
): Promise<{jobs: RawJob[]; httpStatus: number; checkedAt: string}> {
  if (source.provider !== 'ASHBY' || !source.configured || !source.endpoint || !source.company) {
    throw new SourceConnectionError('Ashby source is not fully configured.', 'INVALID_CONFIGURATION');
  }
  const checkedAt = (options.now ?? new Date()).toISOString();
  const response = await fetchJson(source.endpoint, options.fetchImpl, options.timeoutMs);
  const parsed = ashbyPayload.safeParse(response.payload);
  if (!parsed.success) {
    throw new SourceConnectionError(
      `Ashby payload failed validation: ${parsed.error.issues[0]?.message ?? 'unknown error'}`,
      'INVALID_PAYLOAD',
      response.httpStatus,
    );
  }
  const jobs = parsed.data.jobs.map<RawJob>((job) => ({
    sourceId: source.id,
    externalId: job.id,
    provider: 'ASHBY',
    canonicalUrl: absoluteHttpsUrl(job.jobUrl),
    title: job.title.trim(),
    company: source.company as string,
    location: job.location?.trim() || 'Location not specified',
    url: absoluteHttpsUrl(job.applyUrl ?? job.jobUrl),
    publishedAt: validDate(job.publishedAt),
    sourceUpdatedAt: null,
    verifiedAt: checkedAt,
    description: plainText(
      [job.descriptionPlain ?? job.descriptionHtml, job.employmentType, job.workplaceType].filter(Boolean).join(' '),
    ),
    availability: 'LIVE',
  }));
  return {jobs, httpStatus: response.httpStatus, checkedAt};
}
