import {createHash} from 'node:crypto';

export const MAX_PDF_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export type VerifiedPdfAttachment = {
  filename: string;
  mimeType: 'application/pdf';
  base64UrlContent: string;
  byteLength: number;
  sha256: string;
};

export function verifyPdfAttachment(input: {
  filename: string;
  base64UrlContent: string;
  expectedByteLength: number;
  expectedSha256?: string;
}): VerifiedPdfAttachment {
  if (!Number.isSafeInteger(input.expectedByteLength) || input.expectedByteLength < 1) {
    throw new Error('ATTACHMENT_BYTE_LENGTH_INVALID');
  }
  if (
    input.expectedByteLength > MAX_PDF_ATTACHMENT_BYTES ||
    input.base64UrlContent.length > Math.ceil((MAX_PDF_ATTACHMENT_BYTES * 4) / 3) + 4
  ) {
    throw new Error('ATTACHMENT_SIZE_LIMIT_EXCEEDED');
  }
  const bytes = Buffer.from(input.base64UrlContent, 'base64url');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (!input.filename.toLowerCase().endsWith('.pdf')) throw new Error('ATTACHMENT_FILENAME_NOT_PDF');
  if (bytes.length !== input.expectedByteLength) throw new Error('ATTACHMENT_BYTE_LENGTH_MISMATCH');
  if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('ATTACHMENT_PDF_HEADER_INVALID');
  if (
    !bytes
      .subarray(Math.max(0, bytes.length - 1024))
      .toString('latin1')
      .includes('%%EOF')
  ) {
    throw new Error('ATTACHMENT_PDF_EOF_MISSING');
  }
  if (input.expectedSha256 && sha256 !== input.expectedSha256.toLowerCase()) {
    throw new Error('ATTACHMENT_SHA256_MISMATCH');
  }
  return {
    filename: input.filename,
    mimeType: 'application/pdf',
    base64UrlContent: input.base64UrlContent,
    byteLength: bytes.length,
    sha256,
  };
}
