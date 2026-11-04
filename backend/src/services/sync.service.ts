import type { SyncPullResponse } from '@expenseflow/shared';
import { db } from '../db/client';
import { categoriesRepository } from '../repositories/categories.repository';
import { transactionsRepository } from '../repositories/transactions.repository';
import { badRequest } from '../utils/errors';
import { toCategoryDTO, toTransactionDTO } from './mappers';

const PAGE_SIZE = 500;
/**
 * When a pull session completes, the returned cursor is rewound by this overlap so rows whose
 * transactions committed slightly out of timestamp order are not missed. Re-sent rows are
 * harmless because the client upserts by id.
 */
const OVERLAP_MS = 2 * 60_000;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

interface Cursor {
  t: string;
  id: string;
}

function encode(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

function decode(raw: string | undefined): { t: Date; id: string } {
  if (!raw) return { t: new Date(0), id: ZERO_UUID };
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Cursor;
    const t = new Date(c.t);
    if (Number.isNaN(t.getTime()) || typeof c.id !== 'string') throw new Error();
    return { t, id: c.id };
  } catch {
    throw badRequest('Invalid sync cursor');
  }
}

export const syncService = {
  async pull(userId: string, rawCursor: string | undefined): Promise<SyncPullResponse> {
    const after = decode(rawCursor);
    const rows = await transactionsRepository.changedSince(db(), userId, after, PAGE_SIZE + 1);
    const hasMore = rows.length > PAGE_SIZE;
    const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const last = page[page.length - 1];

    // The cursor never moves backwards. Rows updated within the last OVERLAP_MS stay "unsettled"
    // and are re-sent until they age out, which covers late-committing concurrent writes.
    let cursor: Cursor;
    const safe = Date.now() - OVERLAP_MS;
    if (!last) {
      cursor = { t: after.t.toISOString(), id: after.id };
    } else if (hasMore || last.updatedAt.getTime() <= safe) {
      cursor = { t: last.updatedAt.toISOString(), id: last.id };
    } else if (safe > after.t.getTime()) {
      cursor = { t: new Date(safe).toISOString(), id: ZERO_UUID };
    } else {
      cursor = { t: after.t.toISOString(), id: after.id };
    }

    // Categories are small: send full list on the first page of a session.
    const categories = rawCursor && hasMore ? [] : await categoriesRepository.list(db(), userId);

    return {
      transactions: page.map(toTransactionDTO),
      categories: categories.map(toCategoryDTO),
      cursor: encode(cursor),
      hasMore,
    };
  },
};
