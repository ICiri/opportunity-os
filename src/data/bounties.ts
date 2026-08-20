export type BountyProgram = {
  id: string;
  name: string;
  platform: string;
  authorization: 'VERIFY_SCOPE' | 'AUTHORIZED_ONLY';
  reward: string;
  safeHarbor: string;
  sourceUrl: string;
  nextStep: string;
};

export const bountyPrograms: BountyProgram[] = [
  {
    id: 'bugcrowd-public',
    name: 'Bugcrowd public programs',
    platform: 'Bugcrowd',
    authorization: 'VERIFY_SCOPE',
    reward: 'Varies by program',
    safeHarbor: 'Filter for full safe harbor',
    sourceUrl: 'https://www.bugcrowd.com/bug-bounty-list/',
    nextStep:
      'Open the current program brief; confirm in-scope assets, automation limits and disclosure policy before any test.',
  },
  {
    id: 'hackerone-opportunities',
    name: 'HackerOne opportunity directory',
    platform: 'HackerOne',
    authorization: 'VERIFY_SCOPE',
    reward: 'Varies by program',
    safeHarbor: 'Prefer Gold Standard Safe Harbor',
    sourceUrl: 'https://www.hackerone.com/bug-bounty-programs',
    nextStep: 'Choose a public program and record the exact authorized asset and rule version before testing.',
  },
  {
    id: 'hackerone-safe-harbor',
    name: 'Safe Harbor readiness check',
    platform: 'HackerOne guidance',
    authorization: 'AUTHORIZED_ONLY',
    reward: 'Safety gate, not a bounty',
    safeHarbor: 'Required operating rule',
    sourceUrl: 'https://docs.hackerone.com/en/articles/8494502-safe-harbor-overview-faq',
    nextStep: 'Read the policy and never treat safe harbor as broader than the program’s explicit scope.',
  },
];
