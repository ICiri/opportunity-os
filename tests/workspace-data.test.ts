import fs from 'node:fs';
import {describe, expect, it} from 'vitest';
import {bountyPrograms} from '../src/data/bounties';

describe('workspace evidence boundaries', () => {
  it('keeps runtime opportunity and conversation mocks out of the product', () => {
    for (const file of [
      'src/data/opportunities.ts',
      'src/data/conversation-records.ts',
      'src/data/recent-email-audits.ts',
      'src/data/mailbox-snapshots.ts',
    ])
      expect(fs.existsSync(file), file).toBe(false);

    const opportunities = fs.readFileSync('src/app/opportunities/page.tsx', 'utf8');
    const cvRoute = fs.readFileSync('src/app/api/ai/cv-tailor/route.ts', 'utf8');
    const conversations = fs.readFileSync('src/app/conversations/page.tsx', 'utf8');
    expect(opportunities).toContain('loadPersistedHunterJobs');
    expect(opportunities).toContain('reviewableRemoteJobs');
    expect(cvRoute).toContain('loadPersistedHunterJobs');
    expect(cvRoute).not.toContain('data/opportunities');
    expect(conversations).toContain('listPersistedConversations');
  });

  it('loads Gmail bodies only through the encrypted private repository', () => {
    const source = fs.readFileSync('src/lib/gmail/repository.ts', 'utf8');
    expect(source).toContain('private.gmail_message_payloads');
    expect(source).toContain('decryptText');
    expect(source).not.toContain('mailbox-snapshots');
  });

  it('never marks a bounty directory link as automatic authorization', () => {
    expect(
      bountyPrograms.every(
        (item) => item.authorization !== 'AUTHORIZED_ONLY' || item.nextStep.toLowerCase().includes('policy'),
      ),
    ).toBe(true);
    expect(bountyPrograms.some((item) => item.authorization === 'VERIFY_SCOPE')).toBe(true);
  });
});
