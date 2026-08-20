export type MailDirection = 'OUTBOUND' | 'INBOUND';
export type MailRole = 'SENT_EMAIL' | 'RECEIVED_REPLY' | 'MY_LAST_EMAIL';
export type MailAttachment = {filename: string; mimeType: string; sizeBytes: number};
export type MailMessageSnapshot = {
  id: string;
  direction: MailDirection;
  role: MailRole;
  from: string;
  to: string;
  subject: string;
  sentAt: string;
  body: string;
  attachments: MailAttachment[];
};
export type MailThreadSnapshot = {gmailUrl: string; messages: MailMessageSnapshot[]};
