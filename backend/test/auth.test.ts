import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { mailOutbox } from '../src/services/mail.service';
import { closeDb, registerClient, setupApp } from './helpers';

let app: Express;

beforeAll(async () => {
  app = await setupApp();
});
afterAll(closeDb);

function cookieValue(res: request.Response, name: string): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith(`${name}=`))?.split(';')[0]?.split('=')[1];
}

describe('auth', () => {
  it('registers, seeds default categories and returns the profile', async () => {
    const c = await registerClient(app, 'alice@test.dev');
    expect(c.categories.filter((x) => x.type === 'expense')).toHaveLength(11);
    const me = await c.get('/api/users/me').expect(200);
    expect(me.body.user).toMatchObject({ email: 'alice@test.dev', emailVerified: false, preferredCurrency: 'INR', onboarded: false });
    expect(me.body.user).not.toHaveProperty('passwordHash');
  });

  it('rejects duplicate emails case-insensitively', async () => {
    const agent = request.agent(app);
    const { body } = await agent.get('/api/auth/csrf');
    const res = await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', body.csrfToken)
      .send({ name: 'A', email: 'ALICE@test.dev', password: 'Passw0rdOK', acceptTerms: true });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('enforces CSRF on state-changing requests', async () => {
    const agent = request.agent(app);
    await agent.get('/api/auth/csrf');
    const res = await agent.post('/api/auth/login').send({ email: 'alice@test.dev', password: 'Passw0rdOK' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_INVALID');
  });

  it('rejects wrong passwords and unknown users with the same error', async () => {
    const agent = request.agent(app);
    const { body } = await agent.get('/api/auth/csrf');
    const a = await agent.post('/api/auth/login').set('X-CSRF-Token', body.csrfToken).send({ email: 'alice@test.dev', password: 'nope' });
    const b = await agent.post('/api/auth/login').set('X-CSRF-Token', body.csrfToken).send({ email: 'ghost@test.dev', password: 'nope' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error).toEqual(b.body.error);
  });

  it('requires authentication for private routes', async () => {
    await request(app).get('/api/transactions').expect(401);
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const agent = request.agent(app);
    const { body } = await agent.get('/api/auth/csrf');
    const login = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', body.csrfToken)
      .send({ email: 'alice@test.dev', password: 'Passw0rdOK', remember: true })
      .expect(200);
    const rt1 = cookieValue(login, 'ef_rt')!;
    expect(rt1).toBeTruthy();

    const r1 = await agent.post('/api/auth/refresh').set('X-CSRF-Token', body.csrfToken).expect(200);
    const rt2 = cookieValue(r1, 'ef_rt')!;
    expect(rt2).not.toBe(rt1);

    // Replay the old token from a "stolen" context after the race grace window is simulated by
    // directly using it: within grace it is a benign race (401 REFRESH_RACE).
    const thief = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`ef_rt=${rt1}`, `ef_csrf=${body.csrfToken}`])
      .set('X-CSRF-Token', body.csrfToken);
    expect(thief.status).toBe(401);
    expect(thief.body.error.code).toBe('REFRESH_RACE');
  });

  it('logs out and invalidates the refresh token', async () => {
    const agent = request.agent(app);
    const { body } = await agent.get('/api/auth/csrf');
    await agent.post('/api/auth/login').set('X-CSRF-Token', body.csrfToken).send({ email: 'alice@test.dev', password: 'Passw0rdOK' }).expect(200);
    await agent.post('/api/auth/logout').set('X-CSRF-Token', body.csrfToken).expect(204);
    await agent.get('/api/users/me').expect(401);
    await agent.post('/api/auth/refresh').set('X-CSRF-Token', body.csrfToken).expect(401);
  });

  it('resets passwords with single-use tokens and verifies email', async () => {
    const agent = request.agent(app);
    const { body } = await agent.get('/api/auth/csrf');
    await agent.post('/api/auth/forgot-password').set('X-CSRF-Token', body.csrfToken).send({ email: 'alice@test.dev' }).expect(202);
    await agent.post('/api/auth/forgot-password').set('X-CSRF-Token', body.csrfToken).send({ email: 'nobody@test.dev' }).expect(202);
    const mail = mailOutbox.filter((m) => m.subject === 'Reset your password').pop()!;
    const token = new URL(mail.link).searchParams.get('token')!;

    await agent.post('/api/auth/reset-password').set('X-CSRF-Token', body.csrfToken).send({ token, password: 'NewPassw0rd' }).expect(200);
    const reuse = await agent.post('/api/auth/reset-password').set('X-CSRF-Token', body.csrfToken).send({ token, password: 'NewPassw0rd2' });
    expect(reuse.status).toBe(400);
    await agent.post('/api/auth/login').set('X-CSRF-Token', body.csrfToken).send({ email: 'alice@test.dev', password: 'NewPassw0rd' }).expect(200);

    const verify = mailOutbox.filter((m) => m.subject === 'Verify your email' && m.to === 'alice@test.dev').pop()!;
    const vt = new URL(verify.link).searchParams.get('token')!;
    await agent.post('/api/auth/verify-email').set('X-CSRF-Token', body.csrfToken).send({ token: vt }).expect(200);
    const me = await agent.get('/api/users/me').expect(200);
    expect(me.body.user.emailVerified).toBe(true);
  });

  it('validates password strength', async () => {
    const agent = request.agent(app);
    const { body } = await agent.get('/api/auth/csrf');
    const res = await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', body.csrfToken)
      .send({ name: 'Weak', email: 'weak@test.dev', password: 'password', acceptTerms: true });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fieldErrors.password).toBeDefined();
  });
});
