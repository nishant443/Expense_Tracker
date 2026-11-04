import type { CategoryInput, TransactionType } from '@expenseflow/shared';
import { db } from '../db/client';
import type { CategoryRow } from '../db/schema';
import { categoriesRepository } from '../repositories/categories.repository';
import { transactionsRepository } from '../repositories/transactions.repository';
import { recurringRepository } from '../repositories/recurring.repository';
import { badRequest, conflict, isUniqueViolation, notFound } from '../utils/errors';

export const categoryService = {
  list: (userId: string) => categoriesRepository.list(db(), userId),

  /** Ensures a category exists, belongs to the user, and matches the transaction type. */
  async assertUsable(userId: string, categoryId: string, type: TransactionType): Promise<CategoryRow> {
    const c = await categoriesRepository.findById(db(), userId, categoryId);
    if (!c) throw badRequest('Category not found', { fieldErrors: { categoryId: ['Choose a valid category'] } });
    if (c.type !== type) {
      throw badRequest(`Category is for ${c.type}s`, { fieldErrors: { categoryId: [`Choose an ${type} category`] } });
    }
    return c;
  },

  async create(userId: string, input: CategoryInput): Promise<CategoryRow> {
    try {
      return await categoriesRepository.create(db(), { ...input, userId, isDefault: false });
    } catch (err) {
      if (isUniqueViolation(err, 'categories_user_type_name_uq')) throw conflict('A category with this name already exists', 'DUPLICATE');
      throw err;
    }
  },

  async update(userId: string, id: string, input: Partial<Pick<CategoryRow, 'name' | 'icon' | 'color'>>): Promise<CategoryRow> {
    const existing = await categoriesRepository.findById(db(), userId, id);
    if (!existing) throw notFound('Category');
    if (existing.isDefault && input.name && input.name !== existing.name && existing.name === 'Others') {
      throw badRequest('The fallback "Others" category cannot be renamed');
    }
    try {
      return (await categoriesRepository.update(db(), userId, id, input))!;
    } catch (err) {
      if (isUniqueViolation(err, 'categories_user_type_name_uq')) throw conflict('A category with this name already exists', 'DUPLICATE');
      throw err;
    }
  },

  /** Deletes a custom category; its transactions and recurring rules move to "Others". */
  async remove(userId: string, id: string): Promise<void> {
    const existing = await categoriesRepository.findById(db(), userId, id);
    if (!existing) throw notFound('Category');
    if (existing.isDefault) throw badRequest('Default categories cannot be deleted');
    await db().transaction(async (tx) => {
      const fallback = await categoriesRepository.findFallback(tx, userId, existing.type);
      if (!fallback) throw badRequest('Fallback category missing');
      await transactionsRepository.reassignCategory(tx, userId, id, fallback.id);
      await recurringRepository.reassignCategory(tx, userId, id, fallback.id);
      await categoriesRepository.delete(tx, userId, id);
    });
  },
};
