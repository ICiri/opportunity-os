import type {StoredJob} from '../hunter/engine';

export type OpportunityView = Pick<
  StoredJob,
  | 'id'
  | 'canonicalKey'
  | 'company'
  | 'title'
  | 'location'
  | 'url'
  | 'provider'
  | 'sourceId'
  | 'verifiedAt'
  | 'publishedAt'
  | 'sourceUpdatedAt'
  | 'freshness'
  | 'eligibility'
  | 'eligibilityReason'
  | 'eligibilityEvidence'
  | 'availability'
  | 'scoringStatus'
> & {remotePolicy: RemotePolicy; remoteEvidence: string};

export type RemotePolicy = 'REMOTE' | 'HYBRID' | 'ONSITE' | 'UNKNOWN';

export function assessRemotePolicy(job: Pick<StoredJob, 'location' | 'description'>): {
  policy: RemotePolicy;
  evidence: string;
} {
  const text = `${job.location} ${job.description}`.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const matched = (pattern: RegExp) => text.match(pattern)?.[0];
  const hybrid = matched(
    /\bhybrid\b|\bremote and (?:office|onsite|on site)\b|\b[1-5] days? (?:in|at) (?:the )?office\b/,
  );
  if (hybrid) return {policy: 'HYBRID', evidence: `Source wording: ${hybrid}`};
  const onsite = matched(/\bonsite\b|\bon site\b|\boffice based\b|\bin office\b|\bmust work from (?:our|the) office\b/);
  if (onsite) return {policy: 'ONSITE', evidence: `Source wording: ${onsite}`};
  const remote = matched(/\bremote\b|\bwork from (?:home|anywhere)\b|\bfully distributed\b|\bdistributed team\b/);
  if (remote) return {policy: 'REMOTE', evidence: `Source wording: ${remote}`};
  return {policy: 'UNKNOWN', evidence: 'The ATS payload does not explicitly state a remote work policy.'};
}

const eligibilityRank: Record<StoredJob['eligibility'], number> = {
  ELIGIBLE: 0,
  LIKELY_ELIGIBLE: 1,
  UNKNOWN: 2,
  NOT_ELIGIBLE: 3,
};

const freshnessRank: Record<StoredJob['freshness'], number> = {
  NEW: 0,
  FRESH: 1,
  CURRENT: 2,
  UNKNOWN: 3,
  AGING: 4,
  OLD: 5,
  EXPIRED: 6,
};

export function reviewableRemoteJobs(jobs: StoredJob[]) {
  return jobs
    .filter((job) => job.availability === 'LIVE')
    .filter((job) => job.eligibility === 'ELIGIBLE' || job.eligibility === 'LIKELY_ELIGIBLE')
    .filter((job) => assessRemotePolicy(job).policy === 'REMOTE')
    .sort(
      (left, right) =>
        eligibilityRank[left.eligibility] - eligibilityRank[right.eligibility] ||
        freshnessRank[left.freshness] - freshnessRank[right.freshness] ||
        left.company.localeCompare(right.company) ||
        left.title.localeCompare(right.title),
    );
}

export function allLiveJobs(jobs: StoredJob[]) {
  return jobs
    .filter((job) => job.availability === 'LIVE')
    .sort(
      (left, right) =>
        freshnessRank[left.freshness] - freshnessRank[right.freshness] ||
        eligibilityRank[left.eligibility] - eligibilityRank[right.eligibility] ||
        left.company.localeCompare(right.company) ||
        left.title.localeCompare(right.title),
    );
}

export function toOpportunityView(job: StoredJob): OpportunityView {
  const remote = assessRemotePolicy(job);
  return {
    id: job.id,
    canonicalKey: job.canonicalKey,
    company: job.company,
    title: job.title,
    location: job.location,
    url: job.url,
    provider: job.provider,
    sourceId: job.sourceId,
    verifiedAt: job.verifiedAt,
    publishedAt: job.publishedAt,
    sourceUpdatedAt: job.sourceUpdatedAt,
    freshness: job.freshness,
    eligibility: job.eligibility,
    eligibilityReason: job.eligibilityReason,
    eligibilityEvidence: [...job.eligibilityEvidence],
    availability: job.availability,
    scoringStatus: job.scoringStatus,
    remotePolicy: remote.policy,
    remoteEvidence: remote.evidence,
  };
}
