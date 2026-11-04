import { z } from 'zod';
import {
  budgetInputSchema,
  categoryInputSchema,
  categoryUpdateSchema,
  dateRangeQuerySchema,
  exportQuerySchema,
  recurringInputSchema,
  todayISO,
  transactionInputSchema,
  transactionListQuerySchema,
  transactionTypeSchema,
  transactionUpdateSchema,
} from '@expenseflow/shared';
import { db } from '../db/client';
import { usersRepository } from '../repositories/users.repository';
import { analyticsService } from '../services/analytics.service';
import { budgetService } from '../services/budget.service';
import { categoryService } from '../services/category.service';
import { exportService } from '../services/export.service';
import { toCategoryDTO, toNotificationDTO, toRecurringDTO } from '../services/mappers';
import { notificationService } from '../services/notification.service';
import { recurringService } from '../services/recurring.service';
import { syncService } from '../services/sync.service';
import { transactionService } from '../services/transaction.service';
import { asyncHandler, paramId, parseBody, parseQuery, userId } from '../utils/http';

// ───────────────────────── transactions ─────────────────────────
export const transactionController = {
  list: asyncHandler(async (req, res) => {
    res.json(await transactionService.list(userId(req), parseQuery(transactionListQuerySchema, req)));
  }),
  get: asyncHandler(async (req, res) => {
    res.json(await transactionService.get(userId(req), paramId(req)));
  }),
  create: asyncHandler(async (req, res) => {
    const { dto, created } = await transactionService.create(userId(req), parseBody(transactionInputSchema, req));
    res.status(created ? 201 : 200).json(dto);
  }),
  update: asyncHandler(async (req, res) => {
    res.json(await transactionService.update(userId(req), paramId(req), parseBody(transactionUpdateSchema, req)));
  }),
  remove: asyncHandler(async (req, res) => {
    await transactionService.remove(userId(req), paramId(req));
    res.status(204).end();
  }),
  uploadReceipt: asyncHandler(async (req, res) => {
    res.json(await transactionService.attachReceipt(userId(req), paramId(req), req.file));
  }),
  removeReceipt: asyncHandler(async (req, res) => {
    res.json(await transactionService.removeReceipt(userId(req), paramId(req)));
  }),
  receipt: asyncHandler(async (req, res) => {
    const file = await transactionService.getReceipt(userId(req), paramId(req));
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="receipt${file.mimeType === 'application/pdf' ? '.pdf' : ''}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Sandbox anything rendered inline (defence-in-depth for PDFs).
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    res.send(file.data);
  }),
};

export const syncController = {
  pull: asyncHandler(async (req, res) => {
    const { cursor } = parseQuery(z.object({ cursor: z.string().max(500).optional() }), req);
    res.json(await syncService.pull(userId(req), cursor));
  }),
};

// ───────────────────────── categories ─────────────────────────
export const categoryController = {
  list: asyncHandler(async (req, res) => {
    res.json((await categoryService.list(userId(req))).map(toCategoryDTO));
  }),
  create: asyncHandler(async (req, res) => {
    res.status(201).json(toCategoryDTO(await categoryService.create(userId(req), parseBody(categoryInputSchema, req))));
  }),
  update: asyncHandler(async (req, res) => {
    res.json(toCategoryDTO(await categoryService.update(userId(req), paramId(req), parseBody(categoryUpdateSchema, req))));
  }),
  remove: asyncHandler(async (req, res) => {
    await categoryService.remove(userId(req), paramId(req));
    res.status(204).end();
  }),
};

// ───────────────────────── budgets ─────────────────────────
export const budgetController = {
  list: asyncHandler(async (req, res) => {
    res.json(await budgetService.list(userId(req)));
  }),
  create: asyncHandler(async (req, res) => {
    res.status(201).json(await budgetService.create(userId(req), parseBody(budgetInputSchema, req)));
  }),
  update: asyncHandler(async (req, res) => {
    res.json(await budgetService.update(userId(req), paramId(req), parseBody(budgetInputSchema, req)));
  }),
  remove: asyncHandler(async (req, res) => {
    await budgetService.remove(userId(req), paramId(req));
    res.status(204).end();
  }),
};

// ───────────────────────── recurring ─────────────────────────
export const recurringController = {
  list: asyncHandler(async (req, res) => {
    res.json((await recurringService.list(userId(req))).map(toRecurringDTO));
  }),
  create: asyncHandler(async (req, res) => {
    res.status(201).json(toRecurringDTO(await recurringService.create(userId(req), parseBody(recurringInputSchema, req))));
  }),
  update: asyncHandler(async (req, res) => {
    res.json(toRecurringDTO(await recurringService.update(userId(req), paramId(req), parseBody(recurringInputSchema, req))));
  }),
  remove: asyncHandler(async (req, res) => {
    await recurringService.remove(userId(req), paramId(req));
    res.status(204).end();
  }),
};

// ───────────────────────── analytics ─────────────────────────
const rangeOf = (q: { from: string; to: string }) => ({ start: q.from, end: q.to });

export const analyticsController = {
  overview: asyncHandler(async (req, res) => {
    res.json(await analyticsService.overview(userId(req), rangeOf(parseQuery(dateRangeQuerySchema, req))));
  }),
  monthly: asyncHandler(async (req, res) => {
    const { months } = parseQuery(z.object({ months: z.coerce.number().int().min(1).max(24).default(6) }), req);
    const user = await usersRepository.findById(db(), userId(req));
    res.json(await analyticsService.monthly(userId(req), months, todayISO(user?.timezone ?? 'UTC')));
  }),
  categories: asyncHandler(async (req, res) => {
    const range = parseQuery(dateRangeQuerySchema, req);
    const { type } = parseQuery(z.object({ type: transactionTypeSchema.default('expense') }).passthrough(), req);
    res.json(await analyticsService.categories(userId(req), rangeOf(range), type));
  }),
  trends: asyncHandler(async (req, res) => {
    res.json(await analyticsService.trends(userId(req), rangeOf(parseQuery(dateRangeQuerySchema, req))));
  }),
  insights: asyncHandler(async (req, res) => {
    res.json(await analyticsService.insights(userId(req), rangeOf(parseQuery(dateRangeQuerySchema, req))));
  }),
};

// ───────────────────────── notifications ─────────────────────────
export const notificationController = {
  list: asyncHandler(async (req, res) => {
    const { rows, unread } = await notificationService.list(userId(req));
    res.json({ data: rows.map(toNotificationDTO), unread });
  }),
  markRead: asyncHandler(async (req, res) => {
    await notificationService.markRead(userId(req), paramId(req));
    res.status(204).end();
  }),
  markAllRead: asyncHandler(async (req, res) => {
    await notificationService.markAllRead(userId(req));
    res.status(204).end();
  }),
  remove: asyncHandler(async (req, res) => {
    await notificationService.remove(userId(req), paramId(req));
    res.status(204).end();
  }),
};

// ───────────────────────── export ─────────────────────────
export const exportController = {
  transactions: asyncHandler(async (req, res) => {
    const { format, from, to } = parseQuery(exportQuerySchema, req);
    const uid = userId(req);
    const stamp = new Date().toISOString().slice(0, 10);
    const name = `expenseflow-transactions-${stamp}`;
    const out =
      format === 'pdf'
        ? { body: await exportService.pdf(uid, from, to), type: 'application/pdf', ext: 'pdf' }
        : format === 'xlsx'
          ? { body: await exportService.xlsx(uid, from, to), type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' }
          : { body: await exportService.csv(uid, from, to), type: 'text/csv; charset=utf-8', ext: 'csv' };
    res.setHeader('Content-Type', out.type);
    res.setHeader('Content-Disposition', `attachment; filename="${name}.${out.ext}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(out.body);
  }),
};
