export type MessageSignal = {
  deliveryFailure?: boolean;
  inboundReply?: boolean;
  referral?: boolean;
  explicitFutureContact?: boolean;
  positiveProfileFeedback?: boolean;
  roleClosed?: boolean;
};
export function classifyLifecycle(s: MessageSignal) {
  if (s.deliveryFailure) return 'DELIVERY_FAILURE' as const;
  if (s.referral) return 'REFERRED' as const;
  if (s.explicitFutureContact && (s.roleClosed || !s.inboundReply)) return 'REACTIVATE' as const;
  if (s.positiveProfileFeedback) return 'WARM_RELATIONSHIP' as const;
  return 'WAITING' as const;
}
export function auditIntegrity(input: {lifecycle: string; nextAction?: string}) {
  const issues: string[] = [];
  if (input.lifecycle !== 'ARCHIVED' && !input.nextAction) issues.push('ACTIVE_CONVERSATION_WITHOUT_NEXT_ACTION');
  return issues;
}
