import type {DailyBriefInput, DailyBriefCandidate} from './schemas';
import type {DailyBriefSelection} from './contracts';
import {AIGroundingError} from './errors';

const freshStates = new Set<DailyBriefCandidate['freshness']>(['NEW', 'FRESH', 'CURRENT']);
const eligibleStates = new Set<DailyBriefCandidate['eligibility']>(['ELIGIBLE', 'LIKELY_ELIGIBLE']);
const actionableStates = new Set<DailyBriefCandidate['status']>(['DISCOVERED', 'REVIEW', 'CV_PREPARED']);

export function selectDailyBriefCandidates(input: DailyBriefInput): DailyBriefSelection {
  const candidateIds = input.candidates.map((candidate) => candidate.id);
  if (new Set(candidateIds).size !== candidateIds.length) {
    throw new AIGroundingError('DAILY_BRIEF_DUPLICATE_CANDIDATE_IDS');
  }
  const asOfMs = Date.parse(input.asOf);
  const fresh = input.candidates.filter((candidate) => freshStates.has(candidate.freshness));
  const eligible = fresh.filter((candidate) => eligibleStates.has(candidate.eligibility));
  const actionable = eligible.filter(
    (candidate) => actionableStates.has(candidate.status) && Date.parse(candidate.verifiedAt) <= asOfMs,
  );

  const candidates = [...actionable]
    .sort(
      (left, right) =>
        right.expectedValuePerHour - left.expectedValuePerHour ||
        right.fitScore - left.fitScore ||
        right.priority - left.priority ||
        Date.parse(right.verifiedAt) - Date.parse(left.verifiedAt) ||
        (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    )
    .slice(0, input.maxItems);

  const liveSources = new Set(fresh.flatMap((candidate) => candidate.sourceIds)).size;
  return {
    asOf: input.asOf,
    candidates,
    metrics: {
      observed: input.candidates.length,
      fresh: fresh.length,
      eligible: eligible.length,
      actionable: actionable.length,
      selected: candidates.length,
      liveSources,
    },
  };
}
