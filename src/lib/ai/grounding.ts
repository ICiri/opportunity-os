import type {DailyBriefSelection} from './contracts';
import type {CvTailoringDraft, CvTailoringInput, DailyBriefNarrative} from './schemas';
import {AIGroundingError} from './errors';

function duplicates(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value)) return true;
    seen.add(value);
    return false;
  });
}

function assertKnownIds(label: string, ids: string[], allowed: Set<string>) {
  const unknown = ids.filter((id) => !allowed.has(id));
  if (unknown.length) throw new AIGroundingError(`${label}_UNKNOWN_IDS:${[...new Set(unknown)].join(',')}`);
}

const connectiveWords = new Set([
  'and',
  'or',
  'the',
  'a',
  'an',
  'of',
  'to',
  'in',
  'on',
  'for',
  'with',
  'from',
  'through',
  'across',
  'as',
  'at',
  'by',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'i',
  'my',
  'me',
  'we',
  'our',
  'that',
  'this',
  'these',
  'those',
  'both',
  'current',
  'currently',
  'including',
  'using',
  'used',
  'work',
  'works',
  'worked',
  'i',
  'ili',
  'te',
  'u',
  'na',
  'za',
  's',
  'sa',
  'iz',
  'od',
  'do',
  'kao',
  'je',
  'sam',
  'su',
  'bio',
  'bila',
  'bilo',
  'radi',
  'radio',
  'radila',
  'koristi',
  'koristeći',
  'trenutno',
  'uključujući',
]);

function lexicalTokens(value: string) {
  return (
    value
      .normalize('NFKD')
      .toLowerCase()
      .match(/[\p{L}\p{N}+#./-]+/gu) ?? []
  )
    .map((token) => token.replace(/^[-./]+|[-./]+$/g, ''))
    .filter((token) => token.length > 1 && !connectiveWords.has(token));
}

function assertLexicallySupported(label: string, output: string, sources: string[]) {
  const allowed = new Set(sources.flatMap(lexicalTokens));
  const unsupported = [...new Set(lexicalTokens(output).filter((token) => !allowed.has(token)))];
  if (unsupported.length) throw new AIGroundingError(`${label}_UNSUPPORTED_TOKENS:${unsupported.join(',')}`);
}

export function assertCvInputGrounded(input: CvTailoringInput) {
  const factIds = input.verifiedFacts.map((fact) => fact.id);
  const repeatedFacts = duplicates(factIds);
  if (repeatedFacts.length) {
    throw new AIGroundingError(`CV_INPUT_DUPLICATE_FACT_IDS:${[...new Set(repeatedFacts)].join(',')}`);
  }

  const allowedFacts = new Set(factIds);
  const bulletIds = input.baseCv.bullets.map((bullet) => bullet.id);
  const repeatedBullets = duplicates(bulletIds);
  if (repeatedBullets.length) {
    throw new AIGroundingError(`CV_INPUT_DUPLICATE_BULLET_IDS:${[...new Set(repeatedBullets)].join(',')}`);
  }
  for (const bullet of input.baseCv.bullets) {
    assertKnownIds(`CV_INPUT_BULLET_${bullet.id}`, bullet.factIds, allowedFacts);
  }
}

export function assertCvDraftGrounded(input: CvTailoringInput, draft: CvTailoringDraft) {
  const allowedFacts = new Set(input.verifiedFacts.map((fact) => fact.id));
  const facts = new Map(input.verifiedFacts.map((fact) => [fact.id, fact.statement]));
  const allowedBullets = new Set(input.baseCv.bullets.map((bullet) => bullet.id));
  assertKnownIds('CV_HEADLINE', draft.headline.factIds, allowedFacts);
  assertKnownIds('CV_SUMMARY', draft.summary.factIds, allowedFacts);
  assertLexicallySupported(
    'CV_HEADLINE',
    draft.headline.text,
    draft.headline.factIds.map((id) => facts.get(id) ?? ''),
  );
  assertLexicallySupported(
    'CV_SUMMARY',
    draft.summary.text,
    draft.summary.factIds.map((id) => facts.get(id) ?? ''),
  );

  for (const change of draft.bulletChanges) {
    if (!allowedBullets.has(change.sourceBulletId)) {
      throw new AIGroundingError(`CV_CHANGE_UNKNOWN_SOURCE_BULLET:${change.sourceBulletId}`);
    }
    assertKnownIds(`CV_CHANGE_${change.sourceBulletId}`, change.factIds, allowedFacts);
    assertLexicallySupported(
      `CV_CHANGE_${change.sourceBulletId}`,
      change.text,
      change.factIds.map((id) => facts.get(id) ?? ''),
    );
  }

  if (draft.unsupportedClaims.length) {
    throw new AIGroundingError('CV_OUTPUT_CONTAINS_UNSUPPORTED_CLAIMS');
  }
}

export function assertDailyBriefGrounded(selection: DailyBriefSelection, narrative: DailyBriefNarrative) {
  const expectedIds = selection.candidates.map((candidate) => candidate.id);
  const actualIds = narrative.actions.map((action) => action.opportunityId);
  if (expectedIds.length !== actualIds.length || expectedIds.some((id, index) => id !== actualIds[index])) {
    throw new AIGroundingError('DAILY_BRIEF_SELECTION_CHANGED');
  }

  for (const [index, action] of narrative.actions.entries()) {
    const allowedEvidence = new Set(selection.candidates[index].evidenceIds);
    assertKnownIds(`DAILY_BRIEF_${action.opportunityId}`, action.evidenceIds, allowedEvidence);
  }
}
