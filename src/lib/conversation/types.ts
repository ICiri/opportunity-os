export type EvidenceKind = 'FACT' | 'INFERENCE' | 'UNKNOWN';
export type ConversationState =
  'WAITING' | 'REFERRED' | 'WARM_RELATIONSHIP' | 'REACTIVATE' | 'DELIVERY_FAILURE' | 'NOT_A_FIT' | 'UNKNOWN';
export type ConversationRecord = {
  id: string;
  company: string;
  contact: string;
  country: string;
  subject: string;
  sentAt: string;
  state: ConversationState;
  messageCount: number;
  priority: number;
  nextAction: string;
  nextActionAt?: string;
  evidence: {kind: EvidenceKind; text: string; source: string}[];
  draft?: string;
};
