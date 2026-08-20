import {z} from 'zod';
import type {RawJob} from '../engine';
import type {HunterSource} from '../registry';
import {absoluteHttpsUrl, fetchJson, plainText, SourceConnectionError} from './common';

const posting = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  refNumber: z.string().optional(),
  releasedDate: z.string().optional(),
  ref: z.string().url(),
  location: z
    .object({
      fullLocation: z.string().optional(),
      city: z.string().optional(),
      country: z.string().optional(),
      remote: z.boolean().optional(),
    })
    .optional(),
  typeOfEmployment: z.object({label: z.string().optional()}).optional(),
  experienceLevel: z.object({label: z.string().optional()}).optional(),
  function: z.object({label: z.string().optional()}).optional(),
});
const listPayload = z.object({content: z.array(posting).max(100), totalFound: z.number().optional()});
const detailPayload = posting.extend({
  ref: z.string().url().optional(),
  postingUrl: z.string().url().optional(),
  applyUrl: z.string().url().optional(),
  jobAd: z
    .object({
      sections: z.record(z.string(), z.object({title: z.string().optional(), text: z.string().optional()})).optional(),
    })
    .optional(),
});

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export async function fetchSmartRecruitersJobs(
  source: HunterSource,
  options: {fetchImpl?: typeof fetch; now?: Date; timeoutMs?: number} = {},
): Promise<{jobs: RawJob[]; httpStatus: number; checkedAt: string}> {
  if (
    source.provider !== 'SMARTRECRUITERS' ||
    !source.configured ||
    !source.endpoint ||
    !source.company ||
    !source.tenant
  ) {
    throw new SourceConnectionError('SmartRecruiters source is not fully configured.', 'INVALID_CONFIGURATION');
  }
  const checkedAt = (options.now ?? new Date()).toISOString();
  const response = await fetchJson(source.endpoint, options.fetchImpl, options.timeoutMs);
  const parsed = listPayload.safeParse(response.payload);
  if (!parsed.success) {
    throw new SourceConnectionError(
      `SmartRecruiters payload failed validation: ${parsed.error.issues[0]?.message ?? 'unknown error'}`,
      'INVALID_PAYLOAD',
      response.httpStatus,
    );
  }
  const details = await Promise.all(
    parsed.data.content.map(async (item) => {
      const result = await fetchJson(item.ref, options.fetchImpl, options.timeoutMs);
      const detail = detailPayload.safeParse(result.payload);
      if (!detail.success)
        throw new SourceConnectionError(
          'SmartRecruiters detail failed validation.',
          'INVALID_PAYLOAD',
          result.httpStatus,
        );
      return detail.data;
    }),
  );
  const jobs = details.map<RawJob>((job) => {
    const sections = Object.values(job.jobAd?.sections ?? {}).map(
      (section) => `${section.title ?? ''} ${section.text ?? ''}`,
    );
    const context = [
      job.location?.remote ? 'Remote' : '',
      job.typeOfEmployment?.label,
      job.experienceLevel?.label,
      job.function?.label,
    ];
    const jobUrl = job.postingUrl ?? `https://jobs.smartrecruiters.com/${source.tenant}/${job.id}-${slug(job.name)}`;
    return {
      sourceId: source.id,
      externalId: job.id,
      provider: 'SMARTRECRUITERS',
      requisitionId: job.refNumber,
      canonicalUrl: absoluteHttpsUrl(jobUrl),
      title: job.name.trim(),
      company: source.company as string,
      location:
        job.location?.fullLocation ||
        [job.location?.city, job.location?.country].filter(Boolean).join(', ') ||
        'Location not specified',
      url: absoluteHttpsUrl(job.applyUrl ?? jobUrl),
      publishedAt: job.releasedDate ? new Date(job.releasedDate).toISOString() : null,
      sourceUpdatedAt: null,
      verifiedAt: checkedAt,
      description: plainText([...sections, ...context].filter(Boolean).join(' ')),
      availability: 'LIVE',
    };
  });
  return {jobs, httpStatus: response.httpStatus, checkedAt};
}
