import {createHash} from 'node:crypto';

export type RequirementCategory =
  | 'EXPERIENCE_YEARS'
  | 'TECHNOLOGY'
  | 'ARCHITECTURE'
  | 'DOMAIN'
  | 'LEADERSHIP'
  | 'AI_ML'
  | 'CLOUD'
  | 'DEVOPS'
  | 'DATABASE'
  | 'CLIENT_FACING'
  | 'EDUCATION'
  | 'LANGUAGE'
  | 'LOCATION'
  | 'WORK_MODEL';
export type JobRequirement = {
  id: string;
  text: string;
  normalizedSkill?: string;
  category: RequirementCategory;
  importance: 'HARD_MUST' | 'MUST' | 'NICE';
  explicit: boolean;
};
export type EvidenceStrength = 0 | 1 | 2 | 3 | 4 | 5;
export type EvidenceFact = {
  id: string;
  statement: string;
  category?: string;
  sourceLocator?: string;
};
export type RequirementMatch = {
  requirementId: string;
  status: 'STRONG_MATCH' | 'MATCH' | 'PARTIAL' | 'WEAK_EVIDENCE' | 'NO_EVIDENCE' | 'CONTRADICTED';
  evidenceFactIds: string[];
  evidenceStrength: EvidenceStrength;
  explanation: string;
};
export type CvDecision = 'EXCELLENT_MATCH' | 'GOOD_MATCH' | 'BORDERLINE' | 'BLOCKED_HARD_GAP' | 'NOT_ELIGIBLE';
export type RoleFitAnalysis = {
  requirements: JobRequirement[];
  matches: RequirementMatch[];
  decision: CvDecision;
  technicalAdjacency: 'HIGH' | 'MEDIUM' | 'LOW';
  cvScore: number;
  opportunityScore: number;
  hardGaps: string[];
  analysisHash: string;
};

const normalized = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .trim();
const sentences = (value: string) =>
  value
    .split(/(?<=[.!?])\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
const hardLanguage = /\b(must|required|to be considered|minimum|at least)\b/i;

function requirement(
  id: string,
  text: string,
  category: RequirementCategory,
  normalizedSkill?: string,
): JobRequirement {
  const nice = /\b(preferred|ideal|nice to have|also have)\b/i.test(text);
  return {
    id,
    text,
    normalizedSkill,
    category,
    importance: nice ? 'NICE' : hardLanguage.test(text) ? 'HARD_MUST' : 'MUST',
    explicit: true,
  };
}

export function decomposeJobRequirements(description: string): JobRequirement[] {
  const text = description.replace(/\s+/g, ' ').trim();
  const parts = sentences(text);
  const found: JobRequirement[] = [];
  const addMatches = (category: RequirementCategory, pattern: RegExp, skill?: string) => {
    for (const part of parts.filter((item) => pattern.test(item))) {
      found.push(requirement(`req-${found.length + 1}`, part.slice(0, 500), category, skill));
    }
  };
  addMatches('EXPERIENCE_YEARS', /\b\d+\+?\s*years?\b/i, 'backend');
  addMatches('TECHNOLOGY', /\bC#|\.NET\b/i, 'c#/.net');
  addMatches('CLOUD', /\bcloud|Azure\b/i, 'azure/cloud');
  addMatches('ARCHITECTURE', /\bmicroservices?|distributed applications?|scalable|independent services|APIs?\b/i);
  addMatches('DEVOPS', /\bcontainers?|CI\/CD|DevOps\b/i);
  addMatches('AI_ML', /\bAI\/ML|machine learning|ML models?|inference services?|ML\/AI specialists?\b/i);
  addMatches('LEADERSHIP', /\bteam leadership|team management|people management|engineering team lead\b/i);
  addMatches('CLIENT_FACING', /\bclient-facing|delivering software engineering projects\b/i);
  addMatches('DATABASE', /\brelational databases?|Postgres|SQL Server|MySQL\b/i);
  addMatches('LOCATION', /\bEuropean residence|required residence|must reside|location\b/i);
  addMatches('LANGUAGE', /\bEnglish skills?|fluent English\b/i, 'english');
  addMatches('EDUCATION', /\bdegree in computer science|computer science degree\b/i);
  addMatches('WORK_MODEL', /\bfull[ -]?time|part[ -]?time|\d+\s*hours?\s*(?:\/|per)\s*week\b/i);
  const unique = new Map<string, JobRequirement>();
  for (const item of found) unique.set(`${item.category}:${normalized(item.text)}`, item);
  const qualificationGate = /to be considered[\s\S]*(?:must|required)/i.test(text);
  return [...unique.values()].map((item, index) => ({
    ...item,
    id: `req-${index + 1}`,
    importance: qualificationGate && item.importance !== 'NICE' ? 'HARD_MUST' : item.importance,
  }));
}

export function evidenceStrength(fact: EvidenceFact): EvidenceStrength {
  const locator = normalized(fact.sourceLocator ?? '');
  const statement = normalized(fact.statement);
  if (fact.category === 'EXPERIENCE') {
    if (/\b(led|built|implemented|designed|developed|delivered|modernized|owned|supported)\b/.test(statement)) return 5;
    return 4;
  }
  if (/work experience|employment|role/.test(locator)) return 3;
  if (fact.category === 'SKILL' || /core technologies|technology inventory/.test(locator)) return 2;
  return 1;
}

function relevantFacts(requirement: JobRequirement, facts: EvidenceFact[]) {
  const text = normalized(requirement.text);
  const patterns: Record<RequirementCategory, RegExp> = {
    EXPERIENCE_YEARS: /backend|software engineer|developer/,
    TECHNOLOGY: /c#|\.net/,
    ARCHITECTURE: /microservice|distributed|architecture|api|scalable/,
    DOMAIN: /bank|payment|fintech|domain/,
    LEADERSHIP: /managed engineering|people management|direct reports|hiring|engineering team lead/,
    AI_ML: /machine learning|ml model|inference|ml pipeline|ai service.*production|production.*ai/,
    CLOUD: /azure|aws|cloud/,
    DEVOPS: /container|docker|kubernetes|ci\/cd|devops/,
    DATABASE: /postgres|sql server|mysql|oracle|relational database|sql/,
    CLIENT_FACING: /client|customer|stakeholder/,
    EDUCATION: /computer science|degree|university|education/,
    LANGUAGE: /english/,
    LOCATION: /croatia|zagreb|european|eu residence|europe/,
    WORK_MODEL: /part time|full time|hours per week|hours\/week|fractional/,
  };
  const pattern = patterns[requirement.category];
  return facts.filter(
    (fact) =>
      pattern.test(normalized(fact.statement)) ||
      (requirement.normalizedSkill && normalized(fact.statement).includes(normalized(requirement.normalizedSkill))),
  );
}

function requiredYears(text: string) {
  return Number(text.match(/\b(\d+)\+?\s*years?/i)?.[1] ?? 0);
}

export function resolveExperienceDuration(skill: string, facts: EvidenceFact[]) {
  const intervals: {start: number; end: number; id: string}[] = [];
  for (const fact of facts.filter((item) => normalized(item.statement).includes(normalized(skill)))) {
    const match = fact.statement.match(/\b(20\d{2})\s*[–-]\s*(present|20\d{2})\b/i);
    if (!match) continue;
    const start = Number(match[1]) * 12;
    const end =
      match[2].toLowerCase() === 'present'
        ? new Date().getUTCFullYear() * 12 + new Date().getUTCMonth()
        : Number(match[2]) * 12 + 11;
    intervals.push({start, end, id: fact.id});
  }
  if (!intervals.length) return {skill, months: 0, confidence: 'UNKNOWN' as const, evidenceFactIds: []};
  const months = new Set<number>();
  intervals.forEach(({start, end}) => {
    for (let month = start; month <= end; month += 1) months.add(month);
  });
  return {
    skill,
    months: months.size,
    confidence: 'VERIFIED' as const,
    evidenceFactIds: intervals.map((item) => item.id),
  };
}

export function analyzeRoleFit(description: string, facts: EvidenceFact[]): RoleFitAnalysis {
  const requirements = decomposeJobRequirements(description);
  const matches = requirements.map<RequirementMatch>((item) => {
    const evidence = relevantFacts(item, facts);
    let strength = evidence.reduce<EvidenceStrength>(
      (max, fact) => Math.max(max, evidenceStrength(fact)) as EvidenceStrength,
      0,
    );
    if (evidence.length && item.category === 'EDUCATION') strength = 5;
    if (evidence.length && ['LANGUAGE', 'LOCATION'].includes(item.category))
      strength = Math.max(strength, 4) as EvidenceStrength;
    let contradicted = false;
    if (item.category === 'EXPERIENCE_YEARS') {
      const duration = resolveExperienceDuration('backend', facts);
      if (duration.confidence === 'UNKNOWN' || duration.months < requiredYears(item.text) * 12 - 12) strength = 0;
    }
    // Work-model compatibility belongs to application targeting. A full-time role is
    // valid in the full-time track and must not be treated as a CV evidence contradiction.
    const status: RequirementMatch['status'] = contradicted
      ? 'CONTRADICTED'
      : strength >= 5
        ? 'STRONG_MATCH'
        : strength >= 4
          ? 'MATCH'
          : strength === 3
            ? 'PARTIAL'
            : strength > 0
              ? 'WEAK_EVIDENCE'
              : 'NO_EVIDENCE';
    return {
      requirementId: item.id,
      status,
      evidenceFactIds: evidence.map((fact) => fact.id),
      evidenceStrength: strength,
      explanation: contradicted
        ? 'The required work model conflicts with the fractional ≤20 h/week target.'
        : strength
          ? `Supported by ${evidence.length} verified fact(s) at E${strength}.`
          : 'No defensible verified professional evidence.',
    };
  });
  const hardGaps = requirements
    .filter((item) => item.importance === 'HARD_MUST')
    .filter((item) =>
      ['NO_EVIDENCE', 'CONTRADICTED'].includes(matches.find((match) => match.requirementId === item.id)?.status ?? ''),
    )
    .map((item) => item.text);
  const notEligible = false;
  const strong = matches.filter((item) => ['STRONG_MATCH', 'MATCH'].includes(item.status)).length;
  const decision: CvDecision = hardGaps.length
    ? 'BLOCKED_HARD_GAP'
    : notEligible
      ? 'NOT_ELIGIBLE'
      : strong >= Math.max(3, Math.ceil(matches.length * 0.7))
        ? 'EXCELLENT_MATCH'
        : strong >= Math.max(1, Math.ceil(matches.length * 0.45))
          ? 'GOOD_MATCH'
          : 'BORDERLINE';
  const importanceWeight = {HARD_MUST: 3, MUST: 2, NICE: 1} as const;
  const matchValue: Record<RequirementMatch['status'], number> = {
    STRONG_MATCH: 1,
    MATCH: 0.85,
    PARTIAL: 0.55,
    WEAK_EVIDENCE: 0.25,
    NO_EVIDENCE: 0,
    CONTRADICTED: 0,
  };
  const availablePoints = requirements.reduce((sum, item) => sum + importanceWeight[item.importance], 0);
  const earnedPoints = requirements.reduce((sum, item) => {
    const match = matches.find((candidate) => candidate.requirementId === item.id);
    return sum + importanceWeight[item.importance] * matchValue[match?.status ?? 'NO_EVIDENCE'];
  }, 0);
  const cvScore = availablePoints ? Math.round((earnedPoints / availablePoints) * 100) : 0;
  const opportunityScore =
    decision === 'NOT_ELIGIBLE' ? 0 : decision === 'BLOCKED_HARD_GAP' ? Math.min(49, cvScore) : cvScore;
  const payload = JSON.stringify({requirements, matches, decision, cvScore, opportunityScore});
  return {
    requirements,
    matches,
    decision,
    technicalAdjacency: strong >= 3 ? 'HIGH' : strong ? 'MEDIUM' : 'LOW',
    cvScore,
    opportunityScore,
    hardGaps,
    analysisHash: createHash('sha256').update(payload).digest('hex'),
  };
}

export function containsFactStoreLanguage(value: string) {
  return /\b(uses|works as|core technologies listed|work experience ·|page \d+ ·|source fact|verified fact)\b/i.test(
    value,
  );
}

export function canEnterApplicationBatch(decision: CvDecision, hasExactAuditedOverride: boolean) {
  return ['EXCELLENT_MATCH', 'GOOD_MATCH'].includes(decision) || hasExactAuditedOverride;
}

export function selectRoleRelevantFactIds(analysis: RoleFitAnalysis) {
  return new Set(
    analysis.matches.filter((match) => match.evidenceStrength >= 3).flatMap((match) => match.evidenceFactIds),
  );
}
