import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import type { NotificationPrefs } from '@expenseflow/shared';

const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => 'bytea',
  fromDriver: (v) => (Buffer.isBuffer(v) ? v : Buffer.from(v)),
});

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
};

const money = (name: string) => numeric(name, { precision: 14, scale: 2 });

// ───────────────────────── users ─────────────────────────

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    preferredCurrency: text('preferred_currency').notNull().default('INR'),
    theme: text('theme', { enum: ['light', 'dark', 'system'] }).notNull().default('system'),
    monthlyIncome: money('monthly_income'),
    alertThresholds: integer('alert_thresholds').array().notNull().default(sql`'{70,90,100}'::integer[]`),
    notificationPrefs: jsonb('notification_prefs')
      .$type<NotificationPrefs>()
      .notNull()
      .default({ budgetAlerts: true, recurringActivity: true, emailDigest: false }),
    timezone: text('timezone').notNull().default('UTC'),
    avatarId: uuid('avatar_id').references((): AnyPgColumn => attachments.id, { onDelete: 'set null' }),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true, mode: 'date' }),
    onboardedAt: timestamp('onboarded_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('users_email_lower_uq').on(sql`lower(${t.email})`),
    check('users_theme_ck', sql`${t.theme} in ('light','dark','system')`),
    check('users_income_ck', sql`${t.monthlyIncome} is null or ${t.monthlyIncome} >= 0`),
    check('users_currency_ck', sql`char_length(${t.preferredCurrency}) = 3`),
  ],
);

// ───────────────────────── auth ─────────────────────────

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    remember: boolean('remember').notNull().default(false),
    userAgent: text('user_agent'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_uq').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
    index('sessions_family_idx').on(t.familyId),
    index('sessions_expires_idx').on(t.expiresAt),
  ],
);

export const authTokens = pgTable(
  'auth_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose', { enum: ['verify_email', 'reset_password'] }).notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('auth_tokens_hash_uq').on(t.tokenHash),
    index('auth_tokens_user_idx').on(t.userId, t.purpose),
    check('auth_tokens_purpose_ck', sql`${t.purpose} in ('verify_email','reset_password')`),
  ],
);

// ───────────────────────── attachments ─────────────────────────

export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references((): AnyPgColumn => users.id, { onDelete: 'cascade' }),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    data: bytea('data').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('attachments_user_idx').on(t.userId),
    check('attachments_size_ck', sql`${t.sizeBytes} > 0 and ${t.sizeBytes} <= 5242880`),
  ],
);

// ───────────────────────── categories ─────────────────────────

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    icon: text('icon').notNull(),
    color: text('color').notNull(),
    type: text('type', { enum: ['expense', 'income'] }).notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('categories_user_type_name_uq').on(t.userId, t.type, sql`lower(${t.name})`),
    index('categories_user_idx').on(t.userId, t.updatedAt),
    check('categories_type_ck', sql`${t.type} in ('expense','income')`),
    check('categories_color_ck', sql`${t.color} ~ '^#[0-9a-fA-F]{6}$'`),
  ],
);

// ───────────────────────── recurring ─────────────────────────

export const recurringTransactions = pgTable(
  'recurring_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'restrict' }),
    type: text('type', { enum: ['expense', 'income'] }).notNull(),
    amount: money('amount').notNull(),
    description: text('description').notNull(),
    paymentMethod: text('payment_method', {
      enum: ['cash', 'upi', 'credit_card', 'debit_card', 'bank_transfer', 'other'],
    }).notNull(),
    frequency: text('frequency', { enum: ['daily', 'weekly', 'monthly', 'yearly'] }).notNull(),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    nextExecutionDate: date('next_execution_date', { mode: 'string' }),
    endDate: date('end_date', { mode: 'string' }),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index('recurring_user_idx').on(t.userId),
    index('recurring_due_idx').on(t.nextExecutionDate).where(sql`${t.isActive}`),
    check('recurring_amount_ck', sql`${t.amount} > 0`),
    check('recurring_type_ck', sql`${t.type} in ('expense','income')`),
    check('recurring_frequency_ck', sql`${t.frequency} in ('daily','weekly','monthly','yearly')`),
    check('recurring_dates_ck', sql`${t.endDate} is null or ${t.endDate} >= ${t.startDate}`),
  ],
);

// ───────────────────────── transactions ─────────────────────────

export const transactions = pgTable(
  'transactions',
  {
    /** Client-generated UUID; doubles as the idempotency key for offline sync. */
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'restrict' }),
    type: text('type', { enum: ['expense', 'income'] }).notNull(),
    amount: money('amount').notNull(),
    description: text('description').notNull(),
    notes: text('notes'),
    paymentMethod: text('payment_method', {
      enum: ['cash', 'upi', 'credit_card', 'debit_card', 'bank_transfer', 'other'],
    }).notNull(),
    transactionDate: date('transaction_date', { mode: 'string' }).notNull(),
    receiptId: uuid('receipt_id').references(() => attachments.id, { onDelete: 'set null' }),
    recurringId: uuid('recurring_id').references(() => recurringTransactions.id, { onDelete: 'set null' }),
    occurrenceDate: date('occurrence_date', { mode: 'string' }),
    version: integer('version').notNull().default(1),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (t) => [
    index('transactions_user_date_idx')
      .on(t.userId, t.transactionDate.desc(), t.createdAt.desc())
      .where(sql`${t.deletedAt} is null`),
    index('transactions_user_updated_idx').on(t.userId, t.updatedAt),
    index('transactions_user_category_idx').on(t.userId, t.categoryId),
    unique('transactions_recurring_occurrence_uq').on(t.recurringId, t.occurrenceDate),
    check('transactions_amount_ck', sql`${t.amount} > 0`),
    check('transactions_type_ck', sql`${t.type} in ('expense','income')`),
    check(
      'transactions_payment_ck',
      sql`${t.paymentMethod} in ('cash','upi','credit_card','debit_card','bank_transfer','other')`,
    ),
    check('transactions_version_ck', sql`${t.version} >= 1`),
  ],
);

// ───────────────────────── budgets ─────────────────────────

export const budgets = pgTable(
  'budgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** NULL = overall budget across all expense categories */
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }),
    amount: money('amount').notNull(),
    period: text('period', { enum: ['weekly', 'monthly', 'yearly', 'custom'] }).notNull(),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }),
    ...timestamps,
  },
  (t) => [
    index('budgets_user_idx').on(t.userId),
    unique('budgets_user_scope_uq').on(t.userId, t.categoryId, t.period, t.startDate).nullsNotDistinct(),
    check('budgets_amount_ck', sql`${t.amount} > 0`),
    check('budgets_period_ck', sql`${t.period} in ('weekly','monthly','yearly','custom')`),
    check('budgets_dates_ck', sql`${t.endDate} is null or ${t.endDate} >= ${t.startDate}`),
    check('budgets_custom_end_ck', sql`${t.period} <> 'custom' or ${t.endDate} is not null`),
  ],
);

export const budgetAlerts = pgTable(
  'budget_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    budgetId: uuid('budget_id').notNull().references(() => budgets.id, { onDelete: 'cascade' }),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    threshold: integer('threshold').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [unique('budget_alerts_once_uq').on(t.budgetId, t.periodStart, t.threshold)],
);

// ───────────────────────── notifications ─────────────────────────

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    message: text('message').notNull(),
    type: text('type', { enum: ['budget', 'recurring', 'system'] }).notNull(),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_user_idx').on(t.userId, t.createdAt.desc()),
    check('notifications_type_ck', sql`${t.type} in ('budget','recurring','system')`),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type BudgetRow = typeof budgets.$inferSelect;
export type RecurringRow = typeof recurringTransactions.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
