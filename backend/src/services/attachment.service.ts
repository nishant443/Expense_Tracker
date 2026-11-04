import { and, eq } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { attachments } from '../db/schema';
import { assertAllowedType } from '../middleware/upload';
import { badRequest, tooLarge } from '../utils/errors';

/**
 * Attachments are stored in Postgres (bytea) so the API stays stateless and works on
 * ephemeral hosts. Swap this module for object storage (S3/R2) without touching callers.
 */
export const attachmentService = {
  async save(ex: Executor, userId: string, file: Express.Multer.File | undefined, allowed: readonly string[], maxBytes: number): Promise<string> {
    if (!file) throw badRequest('No file uploaded');
    if (file.size > maxBytes) throw tooLarge(`File exceeds ${Math.round(maxBytes / 1024 / 1024)} MB`);
    const mimeType = assertAllowedType(file.buffer, allowed);
    const [row] = await ex
      .insert(attachments)
      .values({ userId, mimeType, sizeBytes: file.size, data: file.buffer })
      .returning({ id: attachments.id });
    return row!.id;
  },

  async get(ex: Executor, userId: string, id: string) {
    const [row] = await ex
      .select()
      .from(attachments)
      .where(and(eq(attachments.userId, userId), eq(attachments.id, id)))
      .limit(1);
    return row;
  },

  async remove(ex: Executor, userId: string, id: string): Promise<void> {
    await ex.delete(attachments).where(and(eq(attachments.userId, userId), eq(attachments.id, id)));
  },
};
