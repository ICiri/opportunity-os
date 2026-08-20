import type {EmailPage, EmailProvider, ProviderEmail} from './provider';
export class MockEmailProvider implements EmailProvider {
  readonly kind = 'mock';
  private readonly messages: ProviderEmail[];
  constructor(messages: ProviderEmail[] = []) {
    this.messages = structuredClone(messages).sort(
      (a, b) => a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id),
    );
  }
  async fetchIncremental({cursor, limit = 100}: {cursor?: string; limit?: number} = {}): Promise<EmailPage> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('EMAIL_PAGE_LIMIT_INVALID');
    const start = cursor === undefined ? 0 : Number(cursor);
    if (!Number.isSafeInteger(start) || start < 0 || start > this.messages.length)
      throw new Error('EMAIL_CURSOR_INVALID');
    const end = Math.min(start + limit, this.messages.length);
    return {
      messages: structuredClone(this.messages.slice(start, end)),
      nextCursor: end < this.messages.length ? String(end) : null,
    };
  }
}
