import { z } from 'zod';
import {
  BUDGET_PERIODS,
  CURRENCY_CODES,
  FREQUENCIES,
  PAYMENT_METHODS,
  THEMES,
  TRANSACTION_TYPES,
} from './constants';
import { compareISO, isValidISODate } from './dates';
import { isPositiveMoney, MONEY_REGEX } from './money';

// ───────────────────────── primitives ─────────────────────────

export const uuidSchema = z.string().uuid();

export const isoDateSchema = z
  .string()
  .refine(isValidISODate, { message: 'Invalid date (expected YYYY-MM-DD)' });

/** Positive money amount as a decimal string. Numbers are accepted and normalised. */
export const amountSchema = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'number' ? v.toString() : v.trim()))
  .refine(isPositiveMoney, { message: 'Enter a valid amount greater than 0 (max 2 decimals)' });

export const optionalMoneySchema = z
  .union([z.string(), z.number(), z.null()])
  .transform((v) => (v === null || v === '' ? null : typeof v === 'number' ? v.toString() : v.trim()))
  .refine((v) => v === null || MONEY_REGEX.test(v), { message: 'Enter a valid amount' });

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Use at most 128 characters')
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v), 'Include upper and lower case letters')
  .refine((v) => /\d/.test(v), 'Include at least one number');

export const nameSchema = z.string().trim().min(1, 'Name is required').max(80);
export const transactionTypeSchema = z.enum(TRANSACTION_TYPES);
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export const themeSchema = z.enum(THEMES);
export const currencySchema = z.enum(CURRENCY_CODES);
export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid colour');
export const iconSchema = z.string().regex(/^[a-z0-9-]{1,40}$/, 'Invalid icon');

// ───────────────────────── auth ─────────────────────────

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the terms' }) }),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(128),
  remember: z.boolean().default(false),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(200), password: passwordSchema });
export const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) });

// ───────────────────────── users ─────────────────────────

export const notificationPrefsSchema = z.object({
  budgetAlerts: z.boolean(),
  recurringActivity: z.boolean(),
  emailDigest: z.boolean(),
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

export const alertThresholdsSchema = z
  .array(z.number().int().min(1).max(200))
  .min(1)
  .max(5)
  .transform((arr) => [...new Set(arr)].sort((a, b) => a - b));

export const updateProfileSchema = z
  .object({
    name: nameSchema,
    preferredCurrency: currencySchema,
    theme: themeSchema,
    monthlyIncome: optionalMoneySchema,
    alertThresholds: alertThresholdsSchema,
    notificationPrefs: notificationPrefsSchema,
    timezone: z.string().max(64).refine(isValidTimeZone, 'Invalid timezone'),
    completeOnboarding: z.boolean(),
  })
  .partial();
export type UpdateProfileInput = z.input<typeof updateProfileSchema>;

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(128),
  newPassword: passwordSchema,
});
export const changeEmailSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
export const deleteAccountSchema = z.object({ password: z.string().min(1, 'Password is required').max(128) });

// ───────────────────────── categories ─────────────────────────

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(40),
  icon: iconSchema,
  color: hexColorSchema,
  type: transactionTypeSchema,
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export const categoryUpdateSchema = categoryInputSchema.omit({ type: true }).partial();

// ───────────────────────── transactions ─────────────────────────

export const transactionInputSchema = z.object({
  id: uuidSchema,
  type: transactionTypeSchema,
  amount: amountSchema,
  categoryId: uuidSchema,
  description: z.string().trim().min(1, 'Description is required').max(120),
  notes: z.string().trim().max(1000).nullish().transform((v) => v || null),
  paymentMethod: paymentMethodSchema,
  transactionDate: isoDateSchema,
});
export type TransactionInput = z.input<typeof transactionInputSchema>;

export const transactionUpdateSchema = transactionInputSchema.omit({ id: true }).extend({
  version: z.number().int().min(1),
});
export type TransactionUpdateInput = z.input<typeof transactionUpdateSchema>;

export const TRANSACTION_SORTS = ['newest', 'oldest', 'highest', 'lowest'] as const;
export type TransactionSort = (typeof TRANSACTION_SORTS)[number];

export const transactionListQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  type: transactionTypeSchema.optional(),
  categoryId: uuidSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(TRANSACTION_SORTS).default('newest'),
});
export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>;

// ───────────────────────── budgets ─────────────────────────

export const budgetInputSchema = z
  .object({
    categoryId: uuidSchema.nullable(),
    amount: amountSchema,
    period: z.enum(BUDGET_PERIODS),
    startDate: isoDateSchema,
    endDate: isoDateSchema.nullable(),
  })
  .refine((b) => b.period !== 'custom' || b.endDate !== null, {
    message: 'Custom budgets need an end date',
    path: ['endDate'],
  })
  .refine((b) => b.endDate === null || compareISO(b.endDate, b.startDate) >= 0, {
    message: 'End date must be after the start date',
    path: ['endDate'],
  });
export type BudgetInput = z.input<typeof budgetInputSchema>;

// ───────────────────────── recurring ─────────────────────────

export const recurringInputSchema = z
  .object({
    type: transactionTypeSchema,
    amount: amountSchema,
    categoryId: uuidSchema,
    description: z.string().trim().min(1, 'Description is required').max(120),
    paymentMethod: paymentMethodSchema,
    frequency: z.enum(FREQUENCIES),
    startDate: isoDateSchema,
    endDate: isoDateSchema.nullable(),
    isActive: z.boolean().default(true),
  })
  .refine((r) => r.endDate === null || compareISO(r.endDate, r.startDate) >= 0, {
    message: 'End date must be on or after the start date',
    path: ['endDate'],
  });
export type RecurringInput = z.input<typeof recurringInputSchema>;

// ───────────────────────── analytics ─────────────────────────

export const dateRangeQuerySchema = z
  .object({ from: isoDateSchema, to: isoDateSchema })
  .refine((r) => compareISO(r.to, r.from) >= 0, { message: '`to` must be on or after `from`', path: ['to'] })
  .refine((r) => (Date.parse(r.to) - Date.parse(r.from)) / 86_400_000 <= 366 * 5, {
    message: 'Range too large',
    path: ['to'],
  });

export const exportQuerySchema = z.object({
  format: z.enum(['csv', 'xlsx', 'pdf']).default('csv'),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});
