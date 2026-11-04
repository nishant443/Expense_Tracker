import {
  ATTACHMENT_MAX_BYTES,
  RECEIPT_MIME_TYPES,
  type TransactionDTO,
  type TransactionListQuery,
  type transactionInputSchema,
  type transactionUpdateSchema,
} from '@expenseflow/shared';
import type { z } from 'zod';
import { db } from '../db/client';
import type { TransactionRow } from '../db/schema';
import { transactionsRepository } from '../repositories/transactions.repository';
import { conflict, notFound } from '../utils/errors';
import { logger } from '../utils/logger';
import { attachmentService } from './attachment.service';
import { budgetService } from './budget.service';
import { categoryService } from './category.service';
import { toTransactionDTO } from './mappers';

type CreateInput = z.output<typeof transactionInputSchema>;
type UpdateInput = z.output<typeof transactionUpdateSchema>;

/** Budget alert evaluation never fails the user's write. */
function afterExpenseWrite(userId: string, rows: (TransactionRow | undefined)[]) {
  const dates = rows.filter((r): r is TransactionRow => !!r && r.type === 'expense').map((r) => r.transactionDate);
  if (!dates.length) return Promise.resolve();
  return budgetService.evaluateAlerts(userId, [...new Set(dates)]).catch((err) => logger.error({ err }, 'Budget alert evaluation failed'));
}

export const transactionService = {
  async list(userId: string, q: TransactionListQuery) {
    const { rows, nextCursor } = await transactionsRepository.list(db(), userId, q);
    return { data: rows.map(toTransactionDTO), nextCursor };
  },

  async get(userId: string, id: string): Promise<TransactionDTO> {
    const row = await transactionsRepository.findById(db(), userId, id);
    if (!row) throw notFound('Transaction');
    return toTransactionDTO(row);
  },

  /**
   * Idempotent create keyed by the client-generated id: replaying the same request (e.g. an
   * offline sync retry) returns the existing record instead of creating a duplicate.
   */
  async create(userId: string, input: CreateInput): Promise<{ dto: TransactionDTO; created: boolean }> {
    await categoryService.assertUsable(userId, input.categoryId, input.type);
    const inserted = await transactionsRepository.insertIfAbsent(db(), { ...input, userId });
    if (inserted) {
      await afterExpenseWrite(userId, [inserted]);
      return { dto: toTransactionDTO(inserted), created: true };
    }
    const owner = await transactionsRepository.findOwnerOf(db(), input.id);
    if (owner !== userId) throw conflict('Transaction id already in use', 'ID_CONFLICT');
    const existing = await transactionsRepository.findById(db(), userId, input.id, true);
    return { dto: toTransactionDTO(existing!), created: false };
  },

  /** Optimistic concurrency: a stale `version` yields 409 with the current server copy. */
  async update(userId: string, id: string, input: UpdateInput): Promise<TransactionDTO> {
    const before = await transactionsRepository.findById(db(), userId, id);
    if (!before) throw notFound('Transaction');
    await categoryService.assertUsable(userId, input.categoryId, input.type);
    const { version, ...data } = input;
    const updated = await transactionsRepository.updateVersioned(db(), userId, id, version, data);
    if (!updated) {
      const current = await transactionsRepository.findById(db(), userId, id, true);
      throw conflict('This transaction was changed on another device', 'VERSION_CONFLICT', {
        current: current ? toTransactionDTO(current) : null,
      });
    }
    await afterExpenseWrite(userId, [updated, before]);
    return toTransactionDTO(updated);
  },

  /** Soft delete (tombstone) so other devices learn about it during sync. Idempotent. */
  async remove(userId: string, id: string): Promise<void> {
    const deleted = await transactionsRepository.softDelete(db(), userId, id);
    if (deleted) return;
    const existing = await transactionsRepository.findById(db(), userId, id, true);
    if (!existing) throw notFound('Transaction');
    // Already deleted → success (replayed delete).
  },

  async attachReceipt(userId: string, id: string, file: Express.Multer.File | undefined): Promise<TransactionDTO> {
    const tx = await transactionsRepository.findById(db(), userId, id);
    if (!tx) throw notFound('Transaction');
    const updated = await db().transaction(async (t) => {
      const receiptId = await attachmentService.save(t, userId, file, RECEIPT_MIME_TYPES, ATTACHMENT_MAX_BYTES);
      const row = await transactionsRepository.update(t, userId, id, { receiptId });
      if (tx.receiptId) await attachmentService.remove(t, userId, tx.receiptId);
      return row!;
    });
    return toTransactionDTO(updated);
  },

  async removeReceipt(userId: string, id: string): Promise<TransactionDTO> {
    const tx = await transactionsRepository.findById(db(), userId, id);
    if (!tx) throw notFound('Transaction');
    if (!tx.receiptId) return toTransactionDTO(tx);
    const updated = await db().transaction(async (t) => {
      const row = await transactionsRepository.update(t, userId, id, { receiptId: null });
      await attachmentService.remove(t, userId, tx.receiptId!);
      return row!;
    });
    return toTransactionDTO(updated);
  },

  async getReceipt(userId: string, id: string) {
    const tx = await transactionsRepository.findById(db(), userId, id);
    if (!tx?.receiptId) throw notFound('Receipt');
    const file = await attachmentService.get(db(), userId, tx.receiptId);
    if (!file) throw notFound('Receipt');
    return file;
  },
};
