import { randomUUID } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { and, eq, gt, isNull, lt, ne, or } from 'drizzle-orm';
import type { LoginInput, RegisterInput } from '@expenseflow/shared';
import { env } from '../config/env';
import { db } from '../db/client';
import { authTokens, sessions, type UserRow } from '../db/schema';
import { signAccessToken } from '../middleware/auth';
import { categoriesRepository } from '../repositories/categories.repository';
import { usersRepository } from '../repositories/users.repository';
import { randomToken, sha256 } from '../utils/crypto';
import { AppError, badRequest, conflict, isUniqueViolation, unauthorized } from '../utils/errors';
import { logger } from '../utils/logger';
import { mailService } from './mail.service';

/** OWASP-recommended Argon2id parameters (19 MiB, t=2, p=1). Argon2id is the library default. */
const ARGON_OPTS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };
/** Used to equalise timing when the account does not exist (prevents user enumeration). */
let dummyHash: string | null = null;

export const hashPassword = (pw: string) => hash(pw, ARGON_OPTS);

export async function verifyPassword(hashValue: string, pw: string): Promise<boolean> {
  try {
    return await verify(hashValue, pw);
  } catch {
    return false;
  }
}

/** Grace window for concurrent refreshes (two tabs racing) before treating reuse as theft. */
const REFRESH_RACE_GRACE_MS = 15_000;

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  refreshExpires: Date;
  remember: boolean;
}

async function issueSession(
  userId: string,
  remember: boolean,
  userAgent: string | undefined,
  familyId: string = randomUUID(),
): Promise<IssuedSession> {
  const refreshToken = randomToken();
  const ttlMs = remember ? env.REFRESH_TOKEN_TTL_DAYS * 86_400_000 : env.SESSION_TTL_HOURS * 3_600_000;
  const refreshExpires = new Date(Date.now() + ttlMs);
  const [session] = await db()
    .insert(sessions)
    .values({ userId, familyId, tokenHash: sha256(refreshToken), remember, userAgent: userAgent?.slice(0, 255), expiresAt: refreshExpires })
    .returning({ id: sessions.id });
  return { accessToken: signAccessToken(userId, session!.id), refreshToken, refreshExpires, remember };
}

async function createEmailToken(userId: string, purpose: 'verify_email' | 'reset_password', ttlMs: number): Promise<string> {
  const token = randomToken();
  // Invalidate older unused tokens of the same purpose.
  await db()
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt)));
  await db().insert(authTokens).values({ userId, purpose, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) });
  return token;
}

async function consumeEmailToken(token: string, purpose: 'verify_email' | 'reset_password'): Promise<string> {
  const [row] = await db()
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(authTokens.tokenHash, sha256(token)),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .returning({ userId: authTokens.userId });
  if (!row) throw badRequest('This link is invalid or has expired');
  return row.userId;
}

export const authService = {
  async register(input: RegisterInput, userAgent?: string): Promise<{ user: UserRow; session: IssuedSession }> {
    const passwordHash = await hashPassword(input.password);
    let user: UserRow;
    try {
      user = await db().transaction(async (tx) => {
        const u = await usersRepository.create(tx, { name: input.name, email: input.email, passwordHash });
        await categoriesRepository.seedDefaults(tx, u.id);
        return u;
      });
    } catch (err) {
      if (isUniqueViolation(err, 'users_email_lower_uq')) {
        throw conflict('An account with this email already exists', 'EMAIL_TAKEN');
      }
      throw err;
    }
    const token = await createEmailToken(user.id, 'verify_email', 24 * 3_600_000);
    void mailService.sendVerification(user.email, user.name, token);
    const session = await issueSession(user.id, true, userAgent);
    return { user, session };
  },

  async login(input: LoginInput, userAgent?: string): Promise<{ user: UserRow; session: IssuedSession }> {
    const user = await usersRepository.findByEmail(db(), input.email);
    if (!user) {
      dummyHash ??= await hashPassword('dummy-password-for-timing');
      await verifyPassword(dummyHash, input.password);
      throw unauthorized('Incorrect email or password', 'INVALID_CREDENTIALS');
    }
    const ok = await verifyPassword(user.passwordHash, input.password);
    if (!ok) throw unauthorized('Incorrect email or password', 'INVALID_CREDENTIALS');
    const session = await issueSession(user.id, input.remember, userAgent);
    return { user, session };
  },

  /** Rotates the refresh token. Reuse of a rotated token revokes the whole session family. */
  async refresh(refreshToken: string | undefined, userAgent?: string): Promise<IssuedSession> {
    if (!refreshToken) throw unauthorized('No session', 'NO_SESSION');
    const [s] = await db().select().from(sessions).where(eq(sessions.tokenHash, sha256(refreshToken))).limit(1);
    if (!s) throw unauthorized('Session not found', 'NO_SESSION');

    if (s.revokedAt) {
      if (Date.now() - s.revokedAt.getTime() < REFRESH_RACE_GRACE_MS) {
        // Another tab just rotated this token; the browser already holds the new cookies.
        throw new AppError(401, 'REFRESH_RACE', 'Session was refreshed concurrently');
      }
      logger.warn({ userId: s.userId, familyId: s.familyId }, 'Refresh token reuse detected — revoking family');
      await db().update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.familyId, s.familyId), isNull(sessions.revokedAt)));
      throw unauthorized('Session revoked', 'SESSION_REVOKED');
    }
    if (s.expiresAt.getTime() <= Date.now()) throw unauthorized('Session expired', 'SESSION_EXPIRED');

    const revoked = await db()
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.id, s.id), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    if (revoked.length === 0) throw new AppError(401, 'REFRESH_RACE', 'Session was refreshed concurrently');

    return issueSession(s.userId, s.remember, userAgent, s.familyId);
  },

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const [s] = await db().select({ familyId: sessions.familyId }).from(sessions).where(eq(sessions.tokenHash, sha256(refreshToken))).limit(1);
    if (s) await db().update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.familyId, s.familyId), isNull(sessions.revokedAt)));
  },

  async logoutAll(userId: string): Promise<void> {
    await db().update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  },

  async logoutOthers(userId: string, keepSessionId: string): Promise<void> {
    await db()
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), ne(sessions.id, keepSessionId)));
  },

  async forgotPassword(email: string): Promise<void> {
    const user = await usersRepository.findByEmail(db(), email);
    if (!user) return; // Same response either way — no enumeration.
    const token = await createEmailToken(user.id, 'reset_password', 3_600_000);
    void mailService.sendPasswordReset(user.email, token);
  },

  async resetPassword(token: string, password: string): Promise<void> {
    const userId = await consumeEmailToken(token, 'reset_password');
    await usersRepository.update(db(), userId, { passwordHash: await hashPassword(password) });
    await this.logoutAll(userId);
  },

  async verifyEmail(token: string): Promise<void> {
    const userId = await consumeEmailToken(token, 'verify_email');
    await usersRepository.update(db(), userId, { emailVerifiedAt: new Date() });
  },

  async resendVerification(userId: string): Promise<void> {
    const user = await usersRepository.findById(db(), userId);
    if (!user || user.emailVerifiedAt) return;
    const token = await createEmailToken(user.id, 'verify_email', 24 * 3_600_000);
    void mailService.sendVerification(user.email, user.name, token);
  },

  async purgeExpired(): Promise<void> {
    const cutoff = new Date(Date.now() - 7 * 86_400_000);
    await db().delete(sessions).where(or(lt(sessions.expiresAt, new Date()), lt(sessions.revokedAt, cutoff)));
    await db().delete(authTokens).where(lt(authTokens.expiresAt, cutoff));
  },

  createEmailToken,
};
