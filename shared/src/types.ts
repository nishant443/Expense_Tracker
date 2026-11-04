import type {
  BudgetPeriod,
  Frequency,
  NotificationType,
  PaymentMethod,
  Theme,
  TransactionType,
} from './constants';
import type { NotificationPrefs } from './schemas';

/** Money values are decimal strings, dates are YYYY-MM-DD, timestamps ISO-8601. */
export type Money = string;
export type ISODate = string;

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  preferredCurrency: string;
  theme: Theme;
  monthlyIncome: Money | null;
  alertThresholds: number[];
  notificationPrefs: NotificationPrefs;
  timezone: string;
  avatarUrl: string | null;
  onboarded: boolean;
  createdAt: string;
}

export interface AuthResponse {
  user: UserDTO;
  csrfToken: string;
}

export interface CategoryDTO {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: TransactionType;
  isDefault: boolean;
  createdAt: string;
}

export interface TransactionDTO {
  id: string;
  type: TransactionType;
  amount: Money;
  categoryId: string;
  description: string;
  notes: string | null;
  paymentMethod: PaymentMethod;
  transactionDate: ISODate;
  hasReceipt: boolean;
  recurringId: string | null;
  version: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  data: T[];
  nextCursor: string | null;
}

export interface SyncPullResponse {
  transactions: TransactionDTO[];
  categories: CategoryDTO[];
  cursor: string;
  /** true when more changes remain; client should pull again with the new cursor */
  hasMore: boolean;
}

export interface BudgetDTO {
  id: string;
  categoryId: string | null;
  amount: Money;
  period: BudgetPeriod;
  startDate: ISODate;
  endDate: ISODate | null;
  createdAt: string;
  updatedAt: string;
  /** Progress within the period containing today (null when the budget is not active today). */
  current: {
    windowStart: ISODate;
    windowEnd: ISODate;
    spent: Money;
    remaining: Money;
    percent: number;
    status: 'ok' | 'warning' | 'danger' | 'exceeded';
  } | null;
}

export interface RecurringDTO {
  id: string;
  type: TransactionType;
  amount: Money;
  categoryId: string;
  description: string;
  paymentMethod: PaymentMethod;
  frequency: Frequency;
  startDate: ISODate;
  nextExecutionDate: ISODate | null;
  endDate: ISODate | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationDTO {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  createdAt: string;
}

export interface PeriodTotals {
  income: Money;
  expense: Money;
  savings: Money;
  /** savings / income, % — null when no income */
  savingsRate: number | null;
  transactionCount: number;
}

export interface OverviewDTO {
  range: { from: ISODate; to: ISODate };
  previousRange: { from: ISODate; to: ISODate };
  current: PeriodTotals;
  previous: PeriodTotals;
  /** All-time income − expense */
  balance: Money;
  change: { income: number | null; expense: number | null; savings: number | null };
}

export interface MonthlyPoint {
  month: string; // YYYY-MM
  income: Money;
  expense: Money;
  savings: Money;
}

export interface CategoryBreakdownItem {
  categoryId: string;
  name: string;
  color: string;
  icon: string;
  total: Money;
  previousTotal: Money;
  percent: number;
  count: number;
}

export interface CategoryBreakdownDTO {
  type: TransactionType;
  total: Money;
  items: CategoryBreakdownItem[];
}

export interface DailyPoint {
  date: ISODate;
  income: Money;
  expense: Money;
}

export interface TrendsDTO {
  daily: DailyPoint[];
  /** Same-length previous window aligned by day index, for comparison lines */
  previousDaily: DailyPoint[];
}

export type InsightTone = 'positive' | 'negative' | 'neutral' | 'warning';
export interface InsightDTO {
  id: string;
  tone: InsightTone;
  icon: string;
  title: string;
  message: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
