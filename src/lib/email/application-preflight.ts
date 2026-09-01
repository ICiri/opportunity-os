import {APPLICATION_BATCH_LIMIT} from '../applications/targeting';

export type OutboundApplication = {
  canonicalJobKey: string;
  company: string;
  recipient: string;
  recipientVerified: boolean;
  subject: string;
  body: string;
  attachmentSha256: string;
};

const normalized = (value: string) => value.trim().toLowerCase();

export function auditApplicationBatch(
  batch: OutboundApplication[],
  sent: Array<Pick<OutboundApplication, 'canonicalJobKey' | 'company' | 'recipient'>>,
) {
  const findings: string[] = [];
  if (batch.length > APPLICATION_BATCH_LIMIT) findings.push('BATCH_LIMIT_EXCEEDED');
  const sentJobs = new Set(sent.map((item) => normalized(item.canonicalJobKey)));
  const sentCompanyRecipients = new Set(
    sent.map((item) => `${normalized(item.company)}::${normalized(item.recipient)}`),
  );
  const batchJobs = new Set<string>();
  const batchCompanyRecipients = new Set<string>();

  for (const item of batch) {
    const job = normalized(item.canonicalJobKey);
    const companyRecipient = `${normalized(item.company)}::${normalized(item.recipient)}`;
    if (!item.recipientVerified) findings.push(`RECIPIENT_NOT_VERIFIED:${item.recipient}`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.recipient)) findings.push(`RECIPIENT_INVALID:${item.recipient}`);
    if (sentJobs.has(job) || batchJobs.has(job)) findings.push(`DUPLICATE_JOB:${item.canonicalJobKey}`);
    if (sentCompanyRecipients.has(companyRecipient) || batchCompanyRecipients.has(companyRecipient)) {
      findings.push(`DUPLICATE_COMPANY_RECIPIENT:${companyRecipient}`);
    }
    if (!/^[a-f0-9]{64}$/.test(item.attachmentSha256)) findings.push(`ATTACHMENT_NOT_VERIFIED:${item.canonicalJobKey}`);
    if (
      /\b(?:attachment was incomplete|\d{1,3}(?:,\d{3})+ bytes|disregard the smaller attachment)\b/i.test(item.body)
    ) {
      findings.push(`TECHNICAL_OR_ROBOTIC_COPY:${item.canonicalJobKey}`);
    }
    if (item.body.length < 180 || item.body.length > 1800)
      findings.push(`MESSAGE_LENGTH_UNSAFE:${item.canonicalJobKey}`);
    batchJobs.add(job);
    batchCompanyRecipients.add(companyRecipient);
  }
  return {allowed: findings.length === 0, findings: [...new Set(findings)]};
}
