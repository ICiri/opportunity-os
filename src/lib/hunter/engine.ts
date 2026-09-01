import {createHash, randomUUID} from 'node:crypto';

export type Provider = 'GREENHOUSE' | 'LEVER' | 'ASHBY' | 'SMARTRECRUITERS' | 'WORKABLE';
export type Availability = 'LIVE' | 'UNKNOWN' | 'CLOSED';
export type Freshness = 'NEW' | 'FRESH' | 'CURRENT' | 'AGING' | 'OLD' | 'EXPIRED' | 'UNKNOWN';
export type Eligibility = 'ELIGIBLE' | 'LIKELY_ELIGIBLE' | 'UNKNOWN' | 'NOT_ELIGIBLE';

export type CandidateMarketProfile = {
  residenceCountry: 'HR';
  workAuthorizationRegions: readonly ('EU' | 'EEA')[];
};

export const CROATIA_PROFILE: CandidateMarketProfile = {
  residenceCountry: 'HR',
  workAuthorizationRegions: ['EU', 'EEA'],
};

// The hunter is scheduled daily. Two hours of grace covers ordinary scheduler delay
// without treating yesterday's check as indefinitely current.
export const HUNTER_VERIFICATION_TTL_MS = 26 * 60 * 60 * 1_000;

export function isVerificationCurrent(verifiedAt: string | Date | null | undefined, now = new Date()) {
  if (!verifiedAt) return false;
  const verifiedTime = verifiedAt instanceof Date ? verifiedAt.getTime() : new Date(verifiedAt).getTime();
  const ageMs = now.getTime() - verifiedTime;
  return Number.isFinite(ageMs) && ageMs >= -5 * 60_000 && ageMs <= HUNTER_VERIFICATION_TTL_MS;
}

export function availabilityAt(
  stored: Availability,
  verifiedAt: string | Date | null | undefined,
  now = new Date(),
): Availability {
  if (stored !== 'LIVE') return stored;
  return isVerificationCurrent(verifiedAt, now) ? 'LIVE' : 'UNKNOWN';
}

export type RawJob = {
  sourceId: string;
  externalId: string;
  provider?: Provider;
  requisitionId?: string | null;
  canonicalUrl?: string;
  title: string;
  company: string;
  location: string;
  url: string;
  publishedAt?: string | null;
  sourceUpdatedAt?: string | null;
  verifiedAt?: string;
  description: string;
  availability?: Availability;
  potentialMax?: number;
  probability?: number;
  effortHours?: number;
  currency?: string;
  valueBasis?: string;
};

export type StoredJob = RawJob & {
  id: string;
  canonicalKey: string;
  contentHash: string;
  freshness: Freshness;
  eligibility: Eligibility;
  eligibilityReason: string;
  eligibilityEvidence: string[];
  availability: Availability;
  expectedValue: number | null;
  expectedValuePerHour: number | null;
  scoringStatus: 'SCORED' | 'INSUFFICIENT_DATA';
  sourceReferences: string[];
  snapshotHashes: string[];
};

export type IngestionResult = {
  jobs: StoredJob[];
  sourceReferences: Map<string, Set<string>>;
  snapshots: Map<string, string[]>;
  seen: number;
  created: number;
  updated: number;
  duplicates: number;
};

export const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');

function sourceReference(job: Pick<RawJob, 'sourceId' | 'externalId'>) {
  return `${job.sourceId}:${job.externalId}`;
}

function canonicalizeUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    for (const name of [...url.searchParams.keys()]) {
      if (/^(utm_|gh_src|lever-source|source$|ref$)/i.test(name)) url.searchParams.delete(name);
    }
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    url.searchParams.sort();
    return url.toString();
  } catch {
    return undefined;
  }
}

function strongIdentityKey(job: RawJob) {
  if (job.requisitionId?.trim()) {
    return `REQ:${normalize(job.company)}:${normalize(job.requisitionId)}`;
  }
  const canonicalUrl = canonicalizeUrl(job.canonicalUrl);
  return canonicalUrl ? `URL:${canonicalUrl}` : undefined;
}

export function canonicalKey(job: RawJob) {
  const strong = strongIdentityKey(job);
  if (strong) return hash(strong);
  // Title/location similarity is not sufficient evidence for an automatic merge.
  return hash(`SOURCE:${sourceReference(job)}`);
}

export function rawJobContentHash(job: RawJob) {
  return hash(
    JSON.stringify([
      normalize(job.title),
      normalize(job.company),
      normalize(job.location),
      normalize(job.description),
      job.publishedAt ?? null,
      job.sourceUpdatedAt ?? null,
      job.potentialMax ?? null,
      job.probability ?? null,
      job.effortHours ?? null,
      job.currency ?? null,
      job.valueBasis ?? null,
    ]),
  );
}

export function freshness(
  publishedAt: string | null | undefined,
  now = new Date(),
  availability: Availability = 'UNKNOWN',
): Freshness {
  if (availability === 'CLOSED') return 'EXPIRED';
  if (!publishedAt) return 'UNKNOWN';
  const published = new Date(publishedAt);
  const ageMs = now.getTime() - published.getTime();
  if (!Number.isFinite(ageMs) || ageMs < -5 * 60_000) return 'UNKNOWN';
  const ageDays = Math.max(0, ageMs) / 86_400_000;
  if (ageDays < 1) return 'NEW';
  if (ageDays <= 3) return 'FRESH';
  if (ageDays <= 7) return 'CURRENT';
  if (ageDays <= 14) return 'AGING';
  return 'OLD';
}

export function assessEligibility(
  job: Pick<RawJob, 'location' | 'description'>,
  _profile: CandidateMarketProfile = CROATIA_PROFILE,
): {status: Eligibility; reason: string; evidence: string[]} {
  const text = normalize(`${job.location} ${job.description}`);
  const evidence: string[] = [];

  if (/excluding croatia|not available in croatia|croatia excluded/.test(text)) {
    return {
      status: 'NOT_ELIGIBLE',
      reason: 'The listing explicitly excludes Croatia.',
      evidence: ['Explicit Croatia exclusion'],
    };
  }

  const restrictedCountry =
    /(us only|united states only|canada only|uk only|united kingdom only|switzerland only|australia only|new zealand only|norway only|iceland only|must (?:be )?(?:located|reside|live) in (?:the )?(?:us|united states|canada|uk|united kingdom|switzerland|australia|new zealand|norway|iceland)|(?:us|united states|canada|uk|united kingdom|switzerland|australia|new zealand) residents? only)/.exec(
      text,
    );
  if (restrictedCountry) {
    return {
      status: 'NOT_ELIGIBLE',
      reason: 'The listing requires residence in a country outside Croatia/EU authorization.',
      evidence: [restrictedCountry[0]],
    };
  }

  if (/(active|current) us security clearance|required us security clearance/.test(text)) {
    return {
      status: 'NOT_ELIGIBLE',
      reason: 'The role requires an existing US security clearance.',
      evidence: ['Existing US security clearance required'],
    };
  }

  if (/croatia|hrvatska/.test(text)) {
    return {
      status: 'ELIGIBLE',
      reason: 'The listing explicitly includes Croatia.',
      evidence: ['Croatia is explicitly included'],
    };
  }

  if (
    /eu remote|remote (?:within|across) (?:the )?eu|european union|eea remote|remote (?:within|across) (?:the )?eea/.test(
      text,
    )
  ) {
    return {
      status: 'LIKELY_ELIGIBLE',
      reason:
        'EU/EEA remote wording includes the candidate region, but employer payroll or Croatian B2B support still requires confirmation.',
      evidence: ['EU/EEA remote scope; Croatia not explicit'],
    };
  }

  if (/remote worldwide|worldwide remote|work from anywhere|remote globally|global remote/.test(text)) {
    return {
      status: 'LIKELY_ELIGIBLE',
      reason:
        'Worldwide remote wording is promising, but employment, payroll, tax or contractor restrictions still require confirmation for Croatia.',
      evidence: ['Worldwide remote wording; Croatia not explicit'],
    };
  }

  if (/emea/.test(text)) {
    return {
      status: 'UNKNOWN',
      reason: 'EMEA alone does not prove that residence in Croatia is accepted.',
      evidence: ['EMEA wording requires country-list confirmation'],
    };
  }

  if (/europe/.test(text) && /(contractor|b2b|remote)/.test(text)) {
    return {
      status: 'LIKELY_ELIGIBLE',
      reason: 'European remote or contractor wording is promising but Croatia is not explicit.',
      evidence: ['European remote/contractor wording'],
    };
  }

  return {
    status: 'UNKNOWN',
    reason: 'The listing does not provide enough location or work-authorization evidence.',
    evidence: [],
  };
}

export function eligibility(job: Pick<RawJob, 'location' | 'description'>): Eligibility {
  return assessEligibility(job).status;
}

export function calculateEconomicScore(job: Pick<RawJob, 'potentialMax' | 'probability' | 'effortHours'>) {
  const values = [job.potentialMax, job.probability, job.effortHours];
  if (values.some((value) => value === undefined)) {
    return {status: 'INSUFFICIENT_DATA' as const, expectedValue: null, expectedValuePerHour: null};
  }
  const potentialMax = job.potentialMax as number;
  const probability = job.probability as number;
  const effortHours = job.effortHours as number;
  if (!Number.isFinite(potentialMax) || potentialMax < 0)
    throw new RangeError('potentialMax must be a finite non-negative number');
  if (!Number.isFinite(probability) || probability < 0 || probability > 100)
    throw new RangeError('probability must be between 0 and 100');
  if (!Number.isFinite(effortHours) || effortHours <= 0) throw new RangeError('effortHours must be greater than zero');
  const expectedValue = potentialMax * (probability / 100);
  return {status: 'SCORED' as const, expectedValue, expectedValuePerHour: expectedValue / effortHours};
}

function buildStoredJob(raw: RawJob, existing?: StoredJob, now = new Date()): StoredJob {
  if (![raw.sourceId, raw.externalId, raw.title, raw.company, raw.location, raw.url].every((value) => value.trim())) {
    throw new TypeError('A job requires non-empty source, external ID, title, company, location, and URL fields');
  }
  if (!URL.canParse(raw.url)) throw new TypeError('A job URL must be absolute');
  const availability = raw.availability ?? existing?.availability ?? 'UNKNOWN';
  const assessment = assessEligibility(raw);
  const score = calculateEconomicScore(raw);
  const contentHash = rawJobContentHash(raw);
  const references = new Set(existing?.sourceReferences ?? []);
  references.add(sourceReference(raw));
  const snapshots = new Set(existing?.snapshotHashes ?? []);
  snapshots.add(contentHash);
  return {
    ...raw,
    id: existing?.id ?? randomUUID(),
    canonicalKey: existing?.canonicalKey ?? canonicalKey(raw),
    contentHash,
    freshness: freshness(raw.publishedAt, now, availability),
    eligibility: assessment.status,
    eligibilityReason: assessment.reason,
    eligibilityEvidence: assessment.evidence,
    availability,
    expectedValue: score.expectedValue,
    expectedValuePerHour: score.expectedValuePerHour,
    scoringStatus: score.status,
    sourceReferences: [...references].sort(),
    snapshotHashes: [...snapshots],
  };
}

export function ingest(items: RawJob[], previous: StoredJob[] = [], now = new Date()): IngestionResult {
  const jobs = previous.map((job) => ({
    ...job,
    sourceReferences: [...(job.sourceReferences ?? [sourceReference(job)])],
    snapshotHashes: [...(job.snapshotHashes ?? [job.contentHash])],
    eligibilityEvidence: [...(job.eligibilityEvidence ?? [])],
  }));
  const bySourceReference = new Map<string, StoredJob>();
  const byStrongIdentity = new Map<string, StoredJob>();
  for (const job of jobs) {
    for (const reference of job.sourceReferences) bySourceReference.set(reference, job);
    const strong = strongIdentityKey(job);
    if (strong) byStrongIdentity.set(strong, job);
  }

  let created = 0;
  let updated = 0;
  let duplicates = 0;
  for (const raw of items) {
    const reference = sourceReference(raw);
    const strong = strongIdentityKey(raw);
    const existing = bySourceReference.get(reference) ?? (strong ? byStrongIdentity.get(strong) : undefined);
    if (!existing) {
      const job = buildStoredJob(raw, undefined, now);
      jobs.push(job);
      for (const item of job.sourceReferences) bySourceReference.set(item, job);
      if (strong) byStrongIdentity.set(strong, job);
      created += 1;
      continue;
    }

    duplicates += 1;
    const sameSource = existing.sourceReferences.includes(reference);
    const nextHash = rawJobContentHash(raw);
    const references = new Set(existing.sourceReferences);
    references.add(reference);
    const snapshots = new Set(existing.snapshotHashes);
    snapshots.add(nextHash);

    let replacement = existing;
    if (sameSource && nextHash !== existing.contentHash) {
      replacement = buildStoredJob(raw, existing, now);
      replacement.sourceReferences = [...references].sort();
      replacement.snapshotHashes = [...snapshots];
      const position = jobs.indexOf(existing);
      jobs[position] = replacement;
      updated += 1;
    } else {
      existing.sourceReferences = [...references].sort();
      existing.snapshotHashes = [...snapshots];
    }
    for (const item of replacement.sourceReferences) bySourceReference.set(item, replacement);
    if (strong) byStrongIdentity.set(strong, replacement);
  }

  const sourceReferences = new Map(jobs.map((job) => [job.id, new Set(job.sourceReferences)]));
  const snapshots = new Map(jobs.map((job) => [job.id, [...job.snapshotHashes]]));
  return {jobs, sourceReferences, snapshots, seen: items.length, created, updated, duplicates};
}

export function rankEligibleJobs(jobs: StoredJob[]) {
  return jobs
    .filter((job) => job.availability === 'LIVE')
    .filter((job) => job.eligibility === 'ELIGIBLE' || job.eligibility === 'LIKELY_ELIGIBLE')
    .filter((job) => job.expectedValuePerHour !== null)
    .sort((left, right) => (right.expectedValuePerHour ?? 0) - (left.expectedValuePerHour ?? 0));
}

export function selectReviewableJobs(jobs: StoredJob[]) {
  const availabilityRank: Record<Availability, number> = {LIVE: 0, UNKNOWN: 1, CLOSED: 2};
  const eligibilityRank: Record<Eligibility, number> = {
    ELIGIBLE: 0,
    LIKELY_ELIGIBLE: 1,
    UNKNOWN: 2,
    NOT_ELIGIBLE: 3,
  };
  const freshnessRank: Record<Freshness, number> = {
    NEW: 0,
    FRESH: 1,
    CURRENT: 2,
    UNKNOWN: 3,
    AGING: 4,
    OLD: 5,
    EXPIRED: 6,
  };
  return jobs
    .filter((job) => job.availability !== 'CLOSED' && job.eligibility !== 'NOT_ELIGIBLE')
    .sort(
      (left, right) =>
        availabilityRank[left.availability] - availabilityRank[right.availability] ||
        eligibilityRank[left.eligibility] - eligibilityRank[right.eligibility] ||
        freshnessRank[left.freshness] - freshnessRank[right.freshness] ||
        left.title.localeCompare(right.title),
    );
}
