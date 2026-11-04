import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES, type updateProfileSchema } from '@expenseflow/shared';
import type { z } from 'zod';
import { db } from '../db/client';
import type { UserRow } from '../db/schema';
import { usersRepository } from '../repositories/users.repository';
import { badRequest, conflict, isUniqueViolation, notFound, unauthorized } from '../utils/errors';
import { attachmentService } from './attachment.service';
import { authService, hashPassword, verifyPassword } from './auth.service';
import { mailService } from './mail.service';

type ProfileUpdate = z.output<typeof updateProfileSchema>;

async function requireUser(userId: string): Promise<UserRow> {
  const user = await usersRepository.findById(db(), userId);
  if (!user) throw unauthorized('Account no longer exists', 'NO_ACCOUNT');
  return user;
}

async function assertPassword(user: UserRow, password: string): Promise<void> {
  if (!(await verifyPassword(user.passwordHash, password))) {
    throw badRequest('Password is incorrect', { fieldErrors: { password: ['Password is incorrect'] } });
  }
}

export const userService = {
  requireUser,

  async updateProfile(userId: string, input: ProfileUpdate): Promise<UserRow> {
    const { completeOnboarding, ...rest } = input;
    const updated = await usersRepository.update(db(), userId, {
      ...rest,
      ...(completeOnboarding ? { onboardedAt: new Date() } : {}),
    });
    if (!updated) throw notFound('User');
    return updated;
  },

  async changePassword(userId: string, sessionId: string, current: string, next: string): Promise<void> {
    const user = await requireUser(userId);
    if (!(await verifyPassword(user.passwordHash, current))) {
      throw badRequest('Current password is incorrect', { fieldErrors: { currentPassword: ['Current password is incorrect'] } });
    }
    await usersRepository.update(db(), userId, { passwordHash: await hashPassword(next) });
    // Sign out every other device; the current session keeps working.
    await authService.logoutOthers(userId, sessionId);
  },

  async changeEmail(userId: string, email: string, password: string): Promise<UserRow> {
    const user = await requireUser(userId);
    await assertPassword(user, password);
    if (user.email.toLowerCase() === email.toLowerCase()) return user;
    try {
      const updated = await usersRepository.update(db(), userId, { email, emailVerifiedAt: null });
      const token = await authService.createEmailToken(userId, 'verify_email', 24 * 3_600_000);
      void mailService.sendVerification(email, user.name, token);
      return updated!;
    } catch (err) {
      if (isUniqueViolation(err, 'users_email_lower_uq')) throw conflict('That email is already in use', 'EMAIL_TAKEN');
      throw err;
    }
  },

  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await requireUser(userId);
    await assertPassword(user, password);
    // ON DELETE CASCADE removes every user-owned row.
    await usersRepository.delete(db(), userId);
  },

  async setAvatar(userId: string, file: Express.Multer.File | undefined): Promise<UserRow> {
    const user = await requireUser(userId);
    return db().transaction(async (tx) => {
      const id = await attachmentService.save(tx, userId, file, AVATAR_MIME_TYPES, AVATAR_MAX_BYTES);
      const updated = await usersRepository.update(tx, userId, { avatarId: id });
      if (user.avatarId) await attachmentService.remove(tx, userId, user.avatarId);
      return updated!;
    });
  },

  async removeAvatar(userId: string): Promise<UserRow> {
    const user = await requireUser(userId);
    return db().transaction(async (tx) => {
      const updated = await usersRepository.update(tx, userId, { avatarId: null });
      if (user.avatarId) await attachmentService.remove(tx, userId, user.avatarId);
      return updated!;
    });
  },

  async getAvatar(userId: string) {
    const user = await requireUser(userId);
    if (!user.avatarId) throw notFound('Avatar');
    const file = await attachmentService.get(db(), userId, user.avatarId);
    if (!file) throw notFound('Avatar');
    return file;
  },
};
