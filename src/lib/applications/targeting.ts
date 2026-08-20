import type {StoredJob} from '../hunter/engine';
import {assessRemotePolicy} from '../opportunities/view-model';

export const APPLICATION_BATCH_LIMIT = 20;

export type TargetDecision = {
  eligible: boolean;
  track: 'ADDITIONAL_FREELANCE' | 'FULL_TIME' | 'UNCLASSIFIED';
  engagement: 'B2B_OR_CONTRACT' | 'UNKNOWN';
  weeklyHours: number | null;
  schedule: 'AFTER_16_COMPATIBLE' | 'POSSIBLE' | 'UNKNOWN';
  reasons: string[];
};

function explicitWeeklyHours(text: string) {
  const ranges = [...text.matchAll(/\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*(?:hours?|hrs?)\s*(?:\/|per\s+)?week\b/gi)];
  const singles = [
    ...text.matchAll(/\b(?:up to|max(?:imum)?\s*)?(\d{1,2})\s*(?:hours?|hrs?)\s*(?:\/|per\s+)?week\b/gi),
  ];
  const maxima = [...ranges.map((match) => Number(match[2])), ...singles.map((match) => Number(match[1]))];
  return maxima.length ? Math.max(...maxima) : null;
}

export function assessFractionalTarget(job: Pick<StoredJob, 'title' | 'description' | 'location'>): TargetDecision {
  const text = `${job.title} ${job.description} ${job.location}`;
  const engagement = /\b(b2b|contract(?:or)?|freelance|fractional|consultant|consulting)\b/i.test(text)
    ? 'B2B_OR_CONTRACT'
    : 'UNKNOWN';
  const weeklyHours = explicitWeeklyHours(text);
  const fullTime = /\bfull[ -]?time\b/i.test(text);
  const remote = assessRemotePolicy(job).policy === 'REMOTE';
  const after16 =
    /\b(async(?:hronous)?|flexible (?:us )?hours?|us (?:working )?hours?|us time zones?|est|edt|cst|cdt|mst|mdt|pst|pdt)\b/i.test(
      text,
    );
  const schedule = after16 ? 'AFTER_16_COMPATIBLE' : remote ? 'POSSIBLE' : 'UNKNOWN';
  const reasons: string[] = [];
  if (!remote) reasons.push('REMOTE_NOT_EXPLICIT');
  if (engagement === 'UNKNOWN') reasons.push('B2B_CONTRACT_NOT_EXPLICIT');
  if (weeklyHours !== null && weeklyHours > 20) reasons.push('WEEKLY_HOURS_TO_NEGOTIATE');
  const track = fullTime ? 'FULL_TIME' : engagement === 'B2B_OR_CONTRACT' ? 'ADDITIONAL_FREELANCE' : 'UNCLASSIFIED';
  if (track === 'UNCLASSIFIED') reasons.push('WORK_TRACK_NOT_EXPLICIT');
  return {
    eligible: remote && (track === 'FULL_TIME' || track === 'ADDITIONAL_FREELANCE'),
    track,
    engagement,
    weeklyHours,
    schedule,
    reasons,
  };
}

export function applicationKey(job: Pick<StoredJob, 'canonicalKey' | 'company'>) {
  return `${job.company.trim().toLowerCase()}::${job.canonicalKey}`;
}
