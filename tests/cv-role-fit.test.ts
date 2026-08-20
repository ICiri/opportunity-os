import {describe, expect, it} from 'vitest';
import {
  analyzeRoleFit,
  canEnterApplicationBatch,
  containsFactStoreLanguage,
  evidenceStrength,
  resolveExperienceDuration,
  selectRoleRelevantFactIds,
} from '../src/lib/cv-agent/role-fit';

const facts = [
  {
    id: 'f-dotnet',
    statement: 'Developed C#/.NET payment services at Erste Bank — 2021–2026',
    category: 'EXPERIENCE',
    sourceLocator: 'Work Experience',
  },
  {
    id: 'f-api',
    statement: 'Built and supported REST APIs for regulated payment flows.',
    category: 'EXPERIENCE',
    sourceLocator: 'Work Experience',
  },
  {
    id: 'f-cloud',
    statement: 'Technologies: Azure, Docker and CI/CD.',
    category: 'EXPERIENCE',
    sourceLocator: 'Work Experience',
  },
  {id: 'f-degree', statement: 'Degree in Computer Science.', category: 'EDUCATION', sourceLocator: 'Education'},
  {id: 'f-location', statement: 'Zagreb, Croatia — European Union.', category: 'CONTACT', sourceLocator: 'Contact'},
  {
    id: 'f-english',
    statement: 'English — professional working proficiency.',
    category: 'SKILL',
    sourceLocator: 'Languages',
  },
  {
    id: 'f-java',
    statement: 'Core technologies include Java and Spring.',
    category: 'SKILL',
    sourceLocator: 'CORE TECHNOLOGIES',
  },
  {
    id: 'f-product',
    statement: 'Coordinated stakeholders and product delivery.',
    category: 'EXPERIENCE',
    sourceLocator: 'Work Experience',
  },
  {
    id: 'f-ai-tools',
    statement: 'Uses AI-assisted coding tools for development.',
    category: 'SKILL',
    sourceLocator: 'CORE TECHNOLOGIES',
  },
];

const janea = `To be considered, you must have 10+ years development experience with backend technologies.
Significant development experience with C# and .NET. Experience building and deploying cloud solutions on Azure.
Hands-on experience integrating ML models into production backend systems. Experience collaborating with ML/AI specialists.
Team leadership and management experience. European residence required. English skills. A degree in computer science.
Work Schedule Full time.`;

describe('CV Agent V2 role-fit gate', () => {
  it('blocks Janea rather than producing a high-fit result', () => {
    const result = analyzeRoleFit(janea, facts);
    expect(result.decision).toBe('BLOCKED_HARD_GAP');
    expect(result.opportunityScore).toBeLessThan(50);
    expect(result.matches.filter((item) => item.status === 'NO_EVIDENCE').length).toBeGreaterThan(0);
  });
  it('inventory-only technology is E2 and cannot become professional expertise', () => {
    expect(evidenceStrength(facts.find((item) => item.id === 'f-java')!)).toBe(2);
  });
  it('keeps unsupported required technology as a gap', () => {
    const result = analyzeRoleFit('You must have production Rust development experience.', facts);
    expect(result.decision).not.toBe('EXCELLENT_MATCH');
  });
  it('fails an explicit 10+ year requirement when duration is materially lower', () => {
    const result = analyzeRoleFit('You must have 10+ years backend development experience.', facts);
    expect(result.matches[0]?.status).toBe('NO_EVIDENCE');
  });
  it('does not turn stakeholder leadership into people management', () => {
    const result = analyzeRoleFit('Engineering team leadership and management is required.', facts);
    expect(result.matches[0]?.status).toBe('NO_EVIDENCE');
  });
  it('does not turn AI-assisted coding into production AI/ML integration', () => {
    const result = analyzeRoleFit('Hands-on production AI/ML model integration is required.', facts);
    expect(result.matches[0]?.status).toBe('NO_EVIDENCE');
  });
  it('detects forbidden fact-store language in candidate-facing prose', () => {
    expect(containsFactStoreLanguage('Core technologies listed in the CV include Java.')).toBe(true);
    expect(containsFactStoreLanguage('Backend Engineer — Erste Bank | 2021–Present')).toBe(false);
  });
  it('counts overlapping experience months once', () => {
    const duration = resolveExperienceDuration('backend', [
      {id: 'a', statement: 'Backend Engineer — 2020–2023', category: 'EXPERIENCE'},
      {id: 'b', statement: 'Backend Consultant — 2022–2024', category: 'EXPERIENCE'},
    ]);
    expect(duration.months).toBe(60);
  });
  it('returns a stable analysis hash for immutable override binding', () => {
    expect(analyzeRoleFit(janea, facts).analysisHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it('keeps hard-gap roles out of a batch unless the exact analysis was overridden', () => {
    expect(canEnterApplicationBatch('BLOCKED_HARD_GAP', false)).toBe(false);
    expect(canEnterApplicationBatch('BLOCKED_HARD_GAP', true)).toBe(true);
  });
  it('removes unrelated inventory from role-specific CV selection', () => {
    const analysis = analyzeRoleFit('C#/.NET development experience is required.', facts);
    const selected = selectRoleRelevantFactIds(analysis);
    expect(selected.has('f-dotnet')).toBe(true);
    expect(selected.has('f-java')).toBe(false);
  });
});
