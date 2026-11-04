import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { closeDb, registerClient, setupApp, tx, cat, type Client } from './helpers';

let app: Express;
let alice: Client;
let bob: Client;

beforeAll(async () => {
  app = await setupApp();
  alice = await registerClient(app);
  bob = await registerClient(app);
});
afterAll(closeDb);

describe('transactions', () => {
  it('creates idempotently using the client id', async () => {
    const body = tx(alice, { amount: '12.34' });
    const first = await alice.post('/api/transactions', body).expect(201);
    const replay = await alice.post('/api/transactions', body).expect(200);
    expect(replay.body.id).toBe(first.body.id);
    expect(first.body.amount).toBe('12.34');
    const list = await alice.get('/api/transactions').expect(200);
    expect(list.body.data.filter((t: { id: string }) => t.id === body.id)).toHaveLength(1);
  });

  it('isolates users completely', async () => {
    const body = tx(alice);
    await alice.post('/api/transactions', body).expect(201);
    await bob.get(`/api/transactions/${body.id}`).expect(404);
    await bob.put(`/api/transactions/${body.id}`, { ...body, id: undefined, version: 1 }).expect(404);
    await bob.del(`/api/transactions/${body.id}`).expect(404);
    // Re-using another user's id is a conflict, not a takeover.
    const hijack = await bob.post('/api/transactions', { ...body, categoryId: cat(bob, 'Food & Dining') });
    expect(hijack.status).toBe(409);
    // Bob cannot use Alice's category.
    const foreign = await bob.post('/api/transactions', tx(bob, { categoryId: cat(alice, 'Shopping') }));
    expect(foreign.status).toBe(400);
  });

  it('rejects category/type mismatches and invalid amounts', async () => {
    expect((await alice.post('/api/transactions', tx(alice, { type: 'income' }))).status).toBe(400);
    expect((await alice.post('/api/transactions', tx(alice, { amount: '0' }))).status).toBe(400);
    expect((await alice.post('/api/transactions', tx(alice, { amount: '1.999' }))).status).toBe(400);
    expect((await alice.post('/api/transactions', tx(alice, { amount: '-5' }))).status).toBe(400);
  });

  it('uses optimistic concurrency on update', async () => {
    const body = tx(alice);
    await alice.post('/api/transactions', body).expect(201);
    const { id, ...rest } = body;
    const ok = await alice.put(`/api/transactions/${id}`, { ...rest, amount: '200', version: 1 }).expect(200);
    expect(ok.body.version).toBe(2);
    const stale = await alice.put(`/api/transactions/${id}`, { ...rest, amount: '300', version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    expect(stale.body.error.details.current.amount).toBe('200.00');
  });

  it('soft-deletes and exposes tombstones through sync', async () => {
    const pull0 = await alice.get('/api/sync/pull').expect(200);
    expect(pull0.body.categories.length).toBeGreaterThan(0);
    const body = tx(alice);
    await alice.post('/api/transactions', body).expect(201);
    await alice.del(`/api/transactions/${body.id}`).expect(204);
    await alice.del(`/api/transactions/${body.id}`).expect(204); // idempotent
    await alice.get(`/api/transactions/${body.id}`).expect(404);
    const pull = await alice.get('/api/sync/pull').expect(200);
    const row = pull.body.transactions.find((t: { id: string }) => t.id === body.id);
    expect(row.deletedAt).not.toBeNull();
    // Bob's sync never contains Alice's rows
    const bobPull = await bob.get('/api/sync/pull').expect(200);
    expect(bobPull.body.transactions.find((t: { id: string }) => t.id === body.id)).toBeUndefined();
  });

  it('paginates, filters, searches and sorts', async () => {
    const c = await registerClient(app);
    const amounts = ['5.00', '50.00', '15.25', '99.99', '1.01'];
    for (const [i, amount] of amounts.entries()) {
      await c.post('/api/transactions', tx(c, { amount, description: i === 2 ? 'Coffee 100%_beans' : `Item ${i}`, transactionDate: `2025-01-0${i + 1}` })).expect(201);
    }
    await c.post('/api/transactions', tx(c, { type: 'income', amount: '1000', categoryId: cat(c, 'Salary', 'income'), transactionDate: '2025-01-10' })).expect(201);

    const p1 = await c.get('/api/transactions?limit=2&sort=newest').expect(200);
    expect(p1.body.data).toHaveLength(2);
    const p2 = await c.get(`/api/transactions?limit=2&sort=newest&cursor=${p1.body.nextCursor}`).expect(200);
    const p3 = await c.get(`/api/transactions?limit=2&sort=newest&cursor=${p2.body.nextCursor}`).expect(200);
    expect(p3.body.nextCursor).toBeNull();
    const ids = [...p1.body.data, ...p2.body.data, ...p3.body.data].map((t: { id: string }) => t.id);
    expect(new Set(ids).size).toBe(6);

    const high = await c.get('/api/transactions?type=expense&sort=highest').expect(200);
    expect(high.body.data.map((t: { amount: string }) => t.amount)).toEqual(['99.99', '50.00', '15.25', '5.00', '1.01']);
    const search = await c.get(`/api/transactions?q=${encodeURIComponent('100%_')}`).expect(200);
    expect(search.body.data).toHaveLength(1);
    const ranged = await c.get('/api/transactions?from=2025-01-02&to=2025-01-04').expect(200);
    expect(ranged.body.data).toHaveLength(3);
  });

  it('computes exact decimal totals in analytics', async () => {
    const c = await registerClient(app);
    for (let i = 0; i < 10; i++) await c.post('/api/transactions', tx(c, { amount: '0.10', transactionDate: '2025-02-10' })).expect(201);
    await c.post('/api/transactions', tx(c, { type: 'income', amount: '1000.30', categoryId: cat(c, 'Salary', 'income'), transactionDate: '2025-02-01' })).expect(201);
    await c.post('/api/transactions', tx(c, { amount: '200', transactionDate: '2025-01-15' })).expect(201);

    const o = await c.get('/api/analytics/overview?from=2025-02-01&to=2025-02-28').expect(200);
    expect(o.body.current).toMatchObject({ income: '1000.30', expense: '1.00', savings: '999.30', transactionCount: 11 });
    expect(o.body.previous.expense).toBe('200.00');
    expect(o.body.change.expense).toBe(-99.5);
    expect(o.body.balance).toBe('799.30');

    const cats = await c.get('/api/analytics/categories?from=2025-02-01&to=2025-02-28&type=expense').expect(200);
    expect(cats.body.items[0]).toMatchObject({ name: 'Food & Dining', total: '1.00', previousTotal: '200.00', percent: 100 });

    const trends = await c.get('/api/analytics/trends?from=2025-02-01&to=2025-02-28').expect(200);
    expect(trends.body.daily).toHaveLength(28);
    expect(trends.body.daily.find((d: { date: string }) => d.date === '2025-02-10').expense).toBe('1.00');

    const insights = await c.get('/api/analytics/insights?from=2025-02-01&to=2025-02-28').expect(200);
    const ids = insights.body.map((i: { id: string }) => i.id);
    expect(ids).toContain('top-category');
    expect(ids).toContain('savings-rate');
  });

  it('reassigns transactions when a custom category is deleted', async () => {
    const created = await alice.post('/api/categories', { name: 'Pets', icon: 'dog', color: '#22C55E', type: 'expense' }).expect(201);
    const body = tx(alice, { categoryId: created.body.id });
    await alice.post('/api/transactions', body).expect(201);
    await alice.del(`/api/categories/${created.body.id}`).expect(204);
    const t = await alice.get(`/api/transactions/${body.id}`).expect(200);
    expect(t.body.categoryId).toBe(cat(alice, 'Others'));
    // defaults are protected
    await alice.del(`/api/categories/${cat(alice, 'Shopping')}`).expect(400);
  });

  it('exports only own data with formula-injection protection', async () => {
    const c = await registerClient(app);
    await c.post('/api/transactions', tx(c, { description: '=HYPERLINK("http://evil")', amount: '9.99' })).expect(201);
    const csv = await c.get('/api/export/transactions?format=csv').expect(200);
    expect(csv.text).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(csv.text).toContain('-9.99');
    expect(csv.text).not.toContain('Lunch');
    const xlsx = await c.get('/api/export/transactions?format=xlsx').buffer(true).expect(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
    const pdf = await c.get('/api/export/transactions?format=pdf').buffer(true).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
  });
});
