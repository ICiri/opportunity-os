export type BusinessPrinciple = {
  id: string;
  source: string;
  domain: string;
  rule: string;
  productBehavior: string;
  acceptance: string;
};
export const businessPrinciples: BusinessPrinciple[] = [
  {
    id: 'FOUNDING_SALES_STAGE_DISCIPLINE',
    source: 'Founding Sales · Pete Kazanjy',
    domain: 'Founder-led sales',
    rule: 'Learn a repeatable motion personally before attempting to scale it.',
    productBehavior: 'Track discovery, qualification, proposal and win separately; do not reward raw send count.',
    acceptance: 'Weekly review shows conversion and learning per stage.',
  },
  {
    id: 'MOM_TEST_BEHAVIOR_EVIDENCE',
    source: 'The Mom Test · Rob Fitzpatrick',
    domain: 'Customer discovery',
    rule: 'Ask about concrete past behavior, cost and workflow rather than compliments or hypothetical intent.',
    productBehavior: 'Discovery notes separate observed behavior, commitment and opinion.',
    acceptance: 'A qualified pain point contains a recent example and measurable consequence.',
  },
  {
    id: 'OBVIOUSLY_AWESOME_POSITIONING',
    source: 'Obviously Awesome · April Dunford',
    domain: 'Positioning',
    rule: 'Position against the real alternative for the customers who value the differentiated capability most.',
    productBehavior: 'Every target account stores alternative, differentiated value, proof and best-fit segment.',
    acceptance: 'Outreach can state why this company, why this problem and why this capability in three lines.',
  },
  {
    id: 'LEAN_ANALYTICS_OMTM',
    source: 'Lean Analytics · Croll & Yoskovitz',
    domain: 'Measurement',
    rule: 'Use one phase-appropriate primary metric while retaining guardrails.',
    productBehavior: 'Primary metric is qualified expected revenue per user hour; reply volume is diagnostic only.',
    acceptance: 'Dashboard highlights one primary metric and no vanity KPI outranks it.',
  },
  {
    id: 'TRUSTED_ADVISOR_CLIENT_FIRST',
    source: 'The Trusted Advisor · Maister, Green & Galford',
    domain: 'Relationships',
    rule: 'Earn trust through credibility, reliability and client-first context, not pressure.',
    productBehavior:
      'Relationship health includes reliability, value delivered, context depth and self-orientation risk.',
    acceptance: 'A retention action must identify client value before asking for more work.',
  },
  {
    id: 'CUSTOMER_SUCCESS_OUTCOME',
    source: 'Customer Success · Mehta, Steinman & Murphy',
    domain: 'Retention',
    rule: 'Manage toward the client’s desired outcome before renewal risk becomes visible.',
    productBehavior: 'Every active client has outcome, health, next value milestone and risk date.',
    acceptance: 'No active client lacks a success checkpoint in the next 30 days.',
  },
  {
    id: 'PREDICTABLE_REVENUE_SEGMENT',
    source: 'Predictable Revenue · Ross & Tyler',
    domain: 'Pipeline',
    rule: 'Separate prospecting, qualification and closing responsibilities even when one person performs them.',
    productBehavior: 'Pipeline metrics distinguish new accounts, qualified conversations, proposals and wins.',
    acceptance: 'Forecast derives from stage probabilities, never a single arbitrary close rate.',
  },
];
