import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { createApp } from '../src/app';
import { closeDb } from '../src/db/client';
import { runMigrations } from '../src/db/migrate';

export async function setupApp() {
  await runMigrations('pglite:memory');
  return createApp();
}

export { closeDb };

export interface Client {
  agent: TestAgent;
  csrf: string;
  userId: string;
  categories: { id: string; name: string; type: string }[];
  get(url: string): request.Test;
  post(url: string, body?: object): request.Test;
  put(url: string, body?: object): request.Test;
  patch(url: string, body?: object): request.Test;
  del(url: string, body?: object): request.Test;
}

export async function registerClient(app: Parameters<typeof request.agent>[0], email = `u${randomUUID().slice(0, 8)}@test.dev`): Promise<Client> {
  const agent = request.agent(app);
  const { body: c } = await agent.get('/api/auth/csrf').expect(200);
  const csrf = c.csrfToken as string;
  const reg = await agent
    .post('/api/auth/register')
    .set('X-CSRF-Token', csrf)
    .send({ name: 'Test User', email, password: 'Passw0rdOK', acceptTerms: true })
    .expect(201);
  const cats = await agent.get('/api/categories').expect(200);
  return {
    agent,
    csrf,
    userId: reg.body.user.id,
    categories: cats.body,
    get: (url) => agent.get(url),
    post: (url, body) => agent.post(url).set('X-CSRF-Token', csrf).send(body ?? {}),
    put: (url, body) => agent.put(url).set('X-CSRF-Token', csrf).send(body ?? {}),
    patch: (url, body) => agent.patch(url).set('X-CSRF-Token', csrf).send(body ?? {}),
    del: (url, body) => agent.delete(url).set('X-CSRF-Token', csrf).send(body ?? {}),
  };
}

export function cat(client: Client, name: string, type = 'expense') {
  const c = client.categories.find((x) => x.name === name && x.type === type);
  if (!c) throw new Error(`category ${name} missing`);
  return c.id;
}

export function tx(client: Client, overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    type: 'expense',
    amount: '100.00',
    categoryId: cat(client, 'Food & Dining'),
    description: 'Lunch',
    paymentMethod: 'upi',
    transactionDate: new Date().toISOString().slice(0, 10),
    ...overrides,
  };
}
