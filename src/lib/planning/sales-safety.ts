export type OutreachPlan = {
  recipientVerified: boolean;
  legitimateRelevance: boolean;
  personalizedEvidence: boolean;
  optedOut: boolean;
  previousTouches: number;
  daysSinceLastTouch: number;
  claimsVerified: boolean;
  humanApproved: boolean;
};
export function auditOutreach(plan: OutreachPlan) {
  const blocks: string[] = [];
  if (!plan.recipientVerified) blocks.push('RECIPIENT_UNVERIFIED');
  if (!plan.legitimateRelevance) blocks.push('NO_LEGITIMATE_RELEVANCE');
  if (!plan.personalizedEvidence) blocks.push('NO_PERSONALIZED_EVIDENCE');
  if (plan.optedOut) blocks.push('OPTED_OUT');
  if (plan.previousTouches >= 2 && plan.daysSinceLastTouch < 30) blocks.push('FOLLOWUP_FREQUENCY_LIMIT');
  if (!plan.claimsVerified) blocks.push('UNVERIFIED_CLAIMS');
  if (!plan.humanApproved) blocks.push('HUMAN_APPROVAL_REQUIRED');
  return {allowed: blocks.length === 0, blocks};
}
