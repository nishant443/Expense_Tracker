import { eq, sql } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { users, type UserRow } from '../db/schema';

export const usersRepository = {
  async findById(ex: Executor, id: string): Promise<UserRow | undefined> {
    const [row] = await ex.select().from(users).where(eq(users.id, id)).limit(1);
    return row;
  },

  async findByEmail(ex: Executor, email: string): Promise<UserRow | undefined> {
    const [row] = await ex
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
      .limit(1);
    return row;
  },

  async create(ex: Executor, data: typeof users.$inferInsert): Promise<UserRow> {
    const [row] = await ex.insert(users).values(data).returning();
    return row!;
  },

  async update(ex: Executor, id: string, data: Partial<typeof users.$inferInsert>): Promise<UserRow | undefined> {
    const [row] = await ex
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return row;
  },

  async delete(ex: Executor, id: string): Promise<void> {
    await ex.delete(users).where(eq(users.id, id));
  },
};
