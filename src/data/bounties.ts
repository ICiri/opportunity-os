export type BountyProgram = {
  id: string;
  name: string;
  platform: string;
  category: 'SECURITY' | 'SOFTWARE_DEVELOPMENT';
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
    category: 'SECURITY',
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
    category: 'SECURITY',
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
    category: 'SECURITY',
    authorization: 'AUTHORIZED_ONLY',
    reward: 'Safety gate, not a bounty',
    safeHarbor: 'Required operating rule',
    sourceUrl: 'https://docs.hackerone.com/en/articles/8494502-safe-harbor-overview-faq',
    nextStep: 'Read the policy and never treat safe harbor as broader than the program’s explicit scope.',
  },
  {
    id: 'intigriti-public',
    name: 'Intigriti public programs',
    platform: 'Intigriti',
    category: 'SECURITY',
    authorization: 'VERIFY_SCOPE',
    reward: 'Varies by program',
    safeHarbor: 'Read each program policy and asset tier',
    sourceUrl: 'https://app.intigriti.com/researcher/programs',
    nextStep: 'Choose a public program, register if required, and record the exact in-scope asset before testing.',
  },
  {
    id: 'yeswehack-public',
    name: 'YesWeHack public programs',
    platform: 'YesWeHack',
    category: 'SECURITY',
    authorization: 'VERIFY_SCOPE',
    reward: 'Varies by program',
    safeHarbor: 'Program rules and KYC may apply',
    sourceUrl: 'https://yeswehack.com/programs',
    nextStep: 'Open the current program rules and verify scope, allowed methods and submission requirements.',
  },
  {
    id: 'immunefi-public',
    name: 'Immunefi bug bounty programs',
    platform: 'Immunefi',
    category: 'SECURITY',
    authorization: 'VERIFY_SCOPE',
    reward: 'Varies by Web3 program',
    safeHarbor: 'Project-specific scope and PoC rules',
    sourceUrl: 'https://immunefi.com/bug-bounty/',
    nextStep: 'Use only a listed in-scope asset and comply with the project’s impact, PoC and payment rules.',
  },
  {
    id: 'algora-development',
    name: 'Paid open-source issues',
    platform: 'Algora',
    category: 'SOFTWARE_DEVELOPMENT',
    authorization: 'VERIFY_SCOPE',
    reward: 'Displayed per issue',
    safeHarbor: 'Repository contribution rules apply',
    sourceUrl: 'https://algora.io/bounties',
    nextStep: 'Pick an issue matching the verified stack, confirm it is unclaimed, and agree the acceptance criteria.',
  },
  {
    id: 'polar-development',
    name: 'Open-source issue funding',
    platform: 'Polar',
    category: 'SOFTWARE_DEVELOPMENT',
    authorization: 'VERIFY_SCOPE',
    reward: 'Displayed per funded issue',
    safeHarbor: 'Repository maintainer approval',
    sourceUrl: 'https://polar.sh/discover',
    nextStep: 'Confirm the issue is open and funded, then coordinate implementation scope with the maintainer.',
  },
];
