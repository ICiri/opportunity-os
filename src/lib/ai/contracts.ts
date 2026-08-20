import type {
  CvTailoringDraft,
  CvTailoringInput,
  DailyBriefCandidate,
  DailyBriefInput,
  DailyBriefNarrative,
} from './schemas';

export type AITokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type AIAuditMetadata = {
  provider: 'openai-responses' | 'mock';
  useCase: 'CV_TAILOR' | 'DAILY_BRIEF';
  requestId: string;
  subjectHash: string;
  responseId: string;
  modelRequested: string;
  modelResolved: string;
  promptVersion: string;
  schemaVersion: string;
  promptHash: string;
  inputHash: string;
  outputHash: string;
  generatedAt: string;
  usage: AITokenUsage | null;
};

export type DailyBriefSelectionMetrics = {
  observed: number;
  fresh: number;
  eligible: number;
  actionable: number;
  selected: number;
  liveSources: number;
};

export type DailyBriefSelection = {
  asOf: string;
  candidates: DailyBriefCandidate[];
  metrics: DailyBriefSelectionMetrics;
};

export type CvTailoringResult = {
  draft: CvTailoringDraft;
  audit: AIAuditMetadata;
};

export type DailyBriefResult = {
  selection: DailyBriefSelection;
  narrative: DailyBriefNarrative;
  audit: AIAuditMetadata;
};

export interface AIProvider {
  readonly kind: 'openai-responses' | 'mock';
  tailorCv(input: CvTailoringInput): Promise<CvTailoringResult>;
  generateDailyBrief(input: DailyBriefInput): Promise<DailyBriefResult>;
}
