import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { addDaysISO, addMonthsISO, todayISO } from '@expenseflow/shared';
import { budgetStatus, crossedThresholds } from '../src/services/budget.service';
import { recurringService } from '../src/services/recurring.service';
import { runRecurringJob } from '../src/jobs/scheduler';
import { closeDb, registerClient, setupApp, tx, cat, type Client } from './helpers';

let app: Express;
let c: Client;
const today = todayISO('UTC');

beforeAll(async () => {
  app = await setupApp();
  c = await registerClient(app);
});
afterAll(closeDb);

describe('budget status helpers', () => {
  it('maps percentages to statuses', () => {
    expect(budgetStatus(10, [70, 90, 100])).toBe('ok');
    expect(budgetStatus(70, [70, 90, 100])).toBe('warning');
    expect(budgetStatus(95, [70, 90, 100])).toBe('danger');
    expect(budgetStatus(100, [70, 90, 100])).toBe('exceeded');
    expect(budgetStatus(120, [80])).toBe('exceeded');
    expect(crossedThresholds(91, [100, 70, 90])).toEqual([70, 90]);
  });
});

describe('budgets', () => {
  it('reports progress and alerts once per threshold crossing', async () => {
    const shopping = cat(c, 'Shopping');
    const b = await c.post('/api/budgets', { categoryId: shopping, amount: '1000', period: 'monthly', startDate: today.slice(0, 8) + '01', endDate: null }).expect(201);
    expect(b.body.current).toMatchObject({ spent: '0.00', remaining: '1000.00', status: 'ok' });

    await c.post('/api/transactions', tx(c, { categoryId: shopping, amount: '750', transactionDate: today })).expect(201);
    await c.post('/api/transactions', tx(c, { categoryId: shopping, amount: '10', transactionDate: today })).expect(201);
    await c.post('/api/transactions', tx(c, { categoryId: shopping, amount: '5', transactionDate: today })).expect(201);

    let n = await c.get('/api/notifications').expect(200);
    const budgetAlerts = () => n.body.data.filter((x: { type: string }) => x.type === 'budget');
    expect(budgetAlerts()).toHaveLength(1); // only the 70% crossing
    expect(budgetAlerts()[0].title).toContain('70%');

    await c.post('/api/transactions', tx(c, { categoryId: shopping, amount: '300', transactionDate: today })).expect(201);
    n = await c.get('/api/notifications').expect(200);
    // 90 and 100 crossed together → a single "exceeded" notification
    expect(budgetAlerts()).toHaveLength(2);
    expect(budgetAlerts()[0].title).toContain('exceeded');

    const list = await c.get('/api/budgets').expect(200);
    expect(list.body[0].current).toMatchObject({ spent: '1065.00', remaining: '-65.00', status: 'exceeded' });

    // Duplicate budget scope rejected
    const dup = await c.post('/api/budgets', { categoryId: shopping, amount: '5', period: 'monthly', startDate: today.slice(0, 8) + '01', endDate: null });
    expect(dup.status).toBe(409);
  });

  it('validates custom budgets', async () => {
    const res = await c.post('/api/budgets', { categoryId: null, amount: '100', period: 'custom', startDate: today, endDate: null });
    expect(res.status).toBe(400);
  });
});

describe('recurring transactions', () => {
  it('back-fills due occurrences idempotently and schedules the next one', async () => {
    const start = addMonthsISO(today, -2);
    const r = await c
      .post('/api/recurring', {
        type: 'expense',
        amount: '15000',
        categoryId: cat(c, 'Bills & Utilities'),
        description: 'Rent',
        paymentMethod: 'bank_transfer',
        frequency: 'monthly',
        startDate: start,
        endDate: null,
      })
      .expect(201);
    expect(r.body.nextExecutionDate > today).toBe(true);

    const count = async () =>
      (await c.get(`/api/transactions?q=Rent&limit=100`).expect(200)).body.data.filter((t: { recurringId: string }) => t.recurringId === r.body.id).length;
    expect(await count()).toBe(3);

    // Re-running the job (and processing the rule directly) never duplicates.
    await runRecurringJob();
    await recurringService.processRule(r.body.id);
    expect(await count()).toBe(3);
  });

  it('respects end dates and deactivates finished rules', async () => {
    const r = await c
      .post('/api/recurring', {
        type: 'income',
        amount: '50',
        categoryId: cat(c, 'Freelance', 'income'),
        description: 'Gig',
        paymentMethod: 'upi',
        frequency: 'daily',
        startDate: addDaysISO(today, -5),
        endDate: addDaysISO(today, -3),
      })
      .expect(201);
    expect(r.body.isActive).toBe(false);
    expect(r.body.nextExecutionDate).toBeNull();
    const list = await c.get('/api/transactions?q=Gig').expect(200);
    expect(list.body.data).toHaveLength(3);
  });

  it('does not create occurrences for future start dates', async () => {
    const r = await c
      .post('/api/recurring', {
        type: 'expense',
        amount: '9.99',
        categoryId: cat(c, 'Entertainment'),
        description: 'Streaming',
        paymentMethod: 'credit_card',
        frequency: 'monthly',
        startDate: addDaysISO(today, 3),
        endDate: null,
      })
      .expect(201);
    expect(r.body.nextExecutionDate).toBe(addDaysISO(today, 3));
    expect((await c.get('/api/transactions?q=Streaming').expect(200)).body.data).toHaveLength(0);
  });
});
