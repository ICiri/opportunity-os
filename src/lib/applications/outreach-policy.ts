export const OUTREACH_PRINCIPLES = [
  {
    id: 'VOSS_CALIBRATED_QUESTION',
    source: 'Never Split the Difference',
    rule: 'End with one low-pressure calibrated question.',
  },
  {id: 'CIALDINI_AUTHORITY_TRUE', source: 'Influence', rule: 'Use only truthful, source-linked authority and proof.'},
  {
    id: 'GETTING_TO_YES_INTERESTS',
    source: 'Getting to Yes',
    rule: 'Address scope, constraints and mutual value before positions.',
  },
  {
    id: 'CARNEGIE_GENUINE_INTEREST',
    source: 'How to Win Friends and Influence People',
    rule: 'Keep the company and its problem central.',
  },
  {
    id: 'MADE_TO_STICK_CONCRETE',
    source: 'Made to Stick',
    rule: 'Prefer one concrete relevant proof point over a claim inventory.',
  },
  {
    id: 'FOUNDING_SALES_STAGE_DISCIPLINE',
    source: 'Founding Sales',
    rule: 'Optimize for qualified conversations, not send volume.',
  },
  {
    id: 'MOM_TEST_BEHAVIOR_EVIDENCE',
    source: 'The Mom Test',
    rule: 'Ask about concrete scope and workflow, not hypothetical praise.',
  },
  {
    id: 'OBVIOUSLY_AWESOME_POSITIONING',
    source: 'Obviously Awesome',
    rule: 'Explain why this role fits the verified capability.',
  },
  {
    id: 'TRUSTED_ADVISOR_CLIENT_FIRST',
    source: 'The Trusted Advisor',
    rule: 'Lead with client value and avoid pressure.',
  },
] as const;

export function applicationMessagePreview(
  company: string,
  title: string,
  track: 'ADDITIONAL_FREELANCE' | 'FULL_TIME' | 'UNCLASSIFIED' = 'ADDITIONAL_FREELANCE',
) {
  const intent =
    track === 'FULL_TIME'
      ? 'I am interested in discussing the remote full-time opportunity and how my verified backend and integration experience maps to your current priorities.'
      : 'I am looking for a remote B2B, contract or freelance engagement that can run alongside my existing commitments; the posting appears relevant to my verified backend and integration experience.';
  const question =
    track === 'FULL_TIME'
      ? 'What are the most important outcomes you would expect from this role in its first three months?'
      : 'How flexible is the engagement structure and weekly allocation for the right contractor?';
  return `Hello ${company} team,

I am reaching out about the ${title} role. ${intent}

${question}

Best,`;
}
