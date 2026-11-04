import { and, count, desc, eq } from 'drizzle-orm';
import type { NotificationType } from '@expenseflow/shared';
import { db, type Executor } from '../db/client';
import { notifications } from '../db/schema';
import { notFound } from '../utils/errors';

export const notificationService = {
  async list(userId: string, limit = 50) {
    const rows = await db()
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
    const [unread] = await db()
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return { rows, unread: Number(unread?.n ?? 0) };
  },

  async create(ex: Executor, userId: string, n: { title: string; message: string; type: NotificationType }) {
    await ex.insert(notifications).values({ userId, ...n });
  },

  async markRead(userId: string, id: string) {
    const rows = await db()
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.id, id)))
      .returning({ id: notifications.id });
    if (!rows.length) throw notFound('Notification');
  },

  async markAllRead(userId: string) {
    await db().update(notifications).set({ isRead: true }).where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  },

  async remove(userId: string, id: string) {
    await db().delete(notifications).where(and(eq(notifications.userId, userId), eq(notifications.id, id)));
  },
};
