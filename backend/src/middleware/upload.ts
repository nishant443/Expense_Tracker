import multer from 'multer';
import { ATTACHMENT_MAX_BYTES } from '@expenseflow/shared';
import { unsupported } from '../utils/errors';

/** In-memory single-file upload; content is re-validated by magic bytes in attachment.service. */
export const singleFileUpload = (field: string, maxBytes = ATTACHMENT_MAX_BYTES) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 5 },
  }).single(field);

/** Detect the real file type from its leading bytes (never trust the client-provided mimetype). */
export function sniffMimeType(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}

export function assertAllowedType(buf: Buffer, allowed: readonly string[]): string {
  const mime = sniffMimeType(buf);
  if (!mime || !allowed.includes(mime)) {
    throw unsupported(`Unsupported file type. Allowed: ${allowed.join(', ')}`);
  }
  return mime;
}
