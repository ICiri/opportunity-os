import {describe, expect, it} from 'vitest';
import {verifyPdfAttachment} from '../src/lib/email/attachment-safety';

const pdf = Buffer.from('%PDF-1.7\napplication cv\n%%EOF\n');

describe('outbound PDF attachment safety', () => {
  it('accepts an intact PDF only when its expected byte count matches', () => {
    const result = verifyPdfAttachment({
      filename: 'cv.pdf',
      base64UrlContent: pdf.toString('base64url'),
      expectedByteLength: pdf.length,
    });
    expect(result.byteLength).toBe(pdf.length);
    expect(result.sha256).toHaveLength(64);
  });

  it('blocks a truncated attachment before delivery', () => {
    const truncated = pdf.subarray(0, 15);
    expect(() =>
      verifyPdfAttachment({
        filename: 'cv.pdf',
        base64UrlContent: truncated.toString('base64url'),
        expectedByteLength: pdf.length,
      }),
    ).toThrow('ATTACHMENT_BYTE_LENGTH_MISMATCH');
  });

  it('blocks content without a complete PDF boundary', () => {
    const noEof = Buffer.from('%PDF-1.7\napplication cv');
    expect(() =>
      verifyPdfAttachment({
        filename: 'cv.pdf',
        base64UrlContent: noEof.toString('base64url'),
        expectedByteLength: noEof.length,
      }),
    ).toThrow('ATTACHMENT_PDF_EOF_MISSING');
  });

  it('blocks invalid or oversized attachment claims before delivery', () => {
    expect(() =>
      verifyPdfAttachment({
        filename: 'cv.pdf',
        base64UrlContent: pdf.toString('base64url'),
        expectedByteLength: 0,
      }),
    ).toThrow('ATTACHMENT_BYTE_LENGTH_INVALID');
    expect(() =>
      verifyPdfAttachment({
        filename: 'cv.pdf',
        base64UrlContent: pdf.toString('base64url'),
        expectedByteLength: 10 * 1024 * 1024 + 1,
      }),
    ).toThrow('ATTACHMENT_SIZE_LIMIT_EXCEEDED');
  });
});
