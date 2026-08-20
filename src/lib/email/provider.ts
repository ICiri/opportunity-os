export type EmailAddress = {address: string; name?: string};
export type ProviderEmail = {
  id: string;
  threadId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  from: EmailAddress;
  to: EmailAddress[];
  subject: string;
  body: string;
  sentAt: string;
};
export type EmailPage = {messages: ProviderEmail[]; nextCursor: string | null};
export interface EmailProvider {
  readonly kind: string;
  fetchIncremental(input: {cursor?: string; limit?: number}): Promise<EmailPage>;
}
