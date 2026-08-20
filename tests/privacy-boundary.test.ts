import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

function walk(dir: string): string[] {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

describe('private mailbox boundary', () => {
  it('keeps the plaintext Gmail capture out of source control', () => {
    expect(fs.existsSync('src/data/mailbox-snapshots.ts')).toBe(false);
    const sources = walk('src')
      .filter((file) => /\.[cm]?[jt]sx?$/.test(file))
      .map((file) => fs.readFileSync(file, 'utf8'))
      .join('\n');
    expect(sources).not.toContain('mail.google.com/mail/u/0/#all/');
    expect(sources).not.toContain('export const mailboxSnapshots');
  });

  it('keeps the mailbox capture outside every client module graph', () => {
    const violations = walk('src')
      .filter((file) => /\.[cm]?[jt]sx?$/.test(file))
      .flatMap((file) => {
        const source = fs.readFileSync(file, 'utf8');
        const isClient = /^\s*['"]use client['"];?/.test(source);
        return isClient && source.includes('mailbox-snapshots') ? [file] : [];
      });
    expect(violations).toEqual([]);
  });

  it('loads only the selected encrypted thread from the dynamic server route', () => {
    const page = fs.readFileSync('src/app/conversations/[id]/page.tsx', 'utf8');
    const repository = fs.readFileSync('src/lib/conversation/repository.ts', 'utf8');
    const workspace = fs.readFileSync('src/components/conversation-workspace.tsx', 'utf8');
    expect(page).toMatch(/export const dynamic\s*=\s*['"]force-dynamic['"]/);
    expect(page).not.toContain('generateStaticParams');
    expect(page).toContain('getPersistedConversation(LOCAL_USER_ID, id)');
    expect(repository).toContain("import 'server-only'");
    expect(repository).toContain('getPrivateMailThread(threadId, userId)');
    expect(page).not.toContain('mailbox-snapshots');
    expect(page).toContain('thread={thread}');
    expect(workspace).toMatch(/thread\?:\s*MailThreadSnapshot/);
    expect(workspace).not.toContain('mailbox-snapshots');
    expect(fs.existsSync('src/data/conversation-records.ts')).toBe(false);
    expect(fs.existsSync('src/data/recent-email-audits.ts')).toBe(false);
  });
});
