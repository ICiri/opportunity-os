import {z} from 'zod';
import type {RawJob} from '../engine';
import type {HunterSource} from '../registry';
import {absoluteHttpsUrl, fetchJson, plainText, SourceConnectionError} from './common';

const leverPayload = z
  .array(
    z.object({
      id: z.string().min(1),
      text: z.string().min(1),
      createdAt: z.union([z.number(), z.string()]).optional(),
      categories: z
        .object({
          location: z.string().optional(),
          allLocations: z.array(z.string()).optional(),
          commitment: z.string().optional(),
          team: z.string().optional(),
          department: z.string().optional(),
        })
        .optional(),
      descriptionPlain: z.string().optional(),
      additionalPlain: z.string().optional(),
      description: z.string().optional(),
      additional: z.string().optional(),
      workplaceType: z.string().optional(),
      hostedUrl: z.string().url().optional(),
      applyUrl: z.string().url().optional(),
    }),
  )
  .max(20_000);

function leverCreatedAt(value: string | number | undefined) {
  if (value === undefined) return null;
  const milliseconds = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(milliseconds)) return null;
  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export async function fetchLeverJobs(
  source: HunterSource,
  options: {fetchImpl?: typeof fetch; now?: Date; timeoutMs?: number} = {},
): Promise<{jobs: RawJob[]; httpStatus: number; checkedAt: string}> {
  if (source.provider !== 'LEVER' || !source.configured || !source.endpoint || !source.company) {
    throw new SourceConnectionError('Lever source is not fully configured.', 'INVALID_CONFIGURATION');
  }
  const checkedAt = (options.now ?? new Date()).toISOString();
  const response = await fetchJson(source.endpoint, options.fetchImpl, options.timeoutMs);
  const parsed = leverPayload.safeParse(response.payload);
  if (!parsed.success) {
    throw new SourceConnectionError(
      `Lever payload failed validation: ${parsed.error.issues[0]?.message ?? 'unknown error'}`,
      'INVALID_PAYLOAD',
      response.httpStatus,
    );
  }
  const jobs = parsed.data.map<RawJob>((job) => {
    const locations = job.categories?.allLocations?.filter(Boolean) ?? [];
    const location =
      locations.length > 0 ? locations.join(' / ') : job.categories?.location?.trim() || 'Location not specified';
    const url = job.hostedUrl ?? job.applyUrl;
    if (!url)
      throw new SourceConnectionError('Lever job is missing a public URL.', 'INVALID_PAYLOAD', response.httpStatus);
    const context = [job.workplaceType, job.categories?.commitment, job.categories?.team, job.categories?.department]
      .filter(Boolean)
      .join('. ');
    return {
      sourceId: source.id,
      externalId: job.id,
      provider: 'LEVER',
      canonicalUrl: absoluteHttpsUrl(job.hostedUrl ?? url),
      title: job.text.trim(),
      company: source.company as string,
      location,
      url: absoluteHttpsUrl(url),
      publishedAt: leverCreatedAt(job.createdAt),
      sourceUpdatedAt: null,
      verifiedAt: checkedAt,
      description: plainText(
        [job.descriptionPlain ?? job.description, job.additionalPlain ?? job.additional, context]
          .filter(Boolean)
          .join(' '),
      ),
      availability: 'LIVE',
    };
  });
  return {jobs, httpStatus: response.httpStatus, checkedAt};
}
