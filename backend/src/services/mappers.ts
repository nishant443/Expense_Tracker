import type {
  CategoryDTO,
  NotificationDTO,
  RecurringDTO,
  TransactionDTO,
  UserDTO,
} from '@expenseflow/shared';
import type { CategoryRow, NotificationRow, RecurringRow, TransactionRow, UserRow } from '../db/schema';

export function toUserDTO(u: UserRow): UserDTO {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    emailVerified: !!u.emailVerifiedAt,
    preferredCurrency: u.preferredCurrency,
    theme: u.theme,
    monthlyIncome: u.monthlyIncome,
    alertThresholds: u.alertThresholds,
    notificationPrefs: u.notificationPrefs,
    timezone: u.timezone,
    // Cache-bust with updatedAt so a new avatar shows immediately.
    avatarUrl: u.avatarId ? `/api/users/me/avatar?v=${u.updatedAt.getTime()}` : null,
    onboarded: !!u.onboardedAt,
    createdAt: u.createdAt.toISOString(),
  };
}

export function toCategoryDTO(c: CategoryRow): CategoryDTO {
  return {
    id: c.id,
    name: c.name,
    icon: c.icon,
    color: c.color,
    type: c.type,
    isDefault: c.isDefault,
    createdAt: c.createdAt.toISOString(),
  };
}

export function toTransactionDTO(t: TransactionRow): TransactionDTO {
  return {
    id: t.id,
    type: t.type,
    amount: t.amount,
    categoryId: t.categoryId,
    description: t.description,
    notes: t.notes,
    paymentMethod: t.paymentMethod,
    transactionDate: t.transactionDate,
    hasReceipt: !!t.receiptId,
    recurringId: t.recurringId,
    version: t.version,
    deletedAt: t.deletedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export function toRecurringDTO(r: RecurringRow): RecurringDTO {
  return {
    id: r.id,
    type: r.type,
    amount: r.amount,
    categoryId: r.categoryId,
    description: r.description,
    paymentMethod: r.paymentMethod,
    frequency: r.frequency,
    startDate: r.startDate,
    nextExecutionDate: r.nextExecutionDate,
    endDate: r.endDate,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function toNotificationDTO(n: NotificationRow): NotificationDTO {
  return {
    id: n.id,
    title: n.title,
    message: n.message,
    type: n.type,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  };
}
