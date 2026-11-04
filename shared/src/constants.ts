export const TRANSACTION_TYPES = ['expense', 'income'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const PAYMENT_METHODS = ['cash', 'upi', 'credit_card', 'debit_card', 'bank_transfer', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  credit_card: 'Credit Card',
  debit_card: 'Debit Card',
  bank_transfer: 'Bank Transfer',
  other: 'Other',
};

export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEMES)[number];

export const BUDGET_PERIODS = ['weekly', 'monthly', 'yearly', 'custom'] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

export const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const NOTIFICATION_TYPES = ['budget', 'recurring', 'system'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const DEFAULT_ALERT_THRESHOLDS = [70, 90, 100] as const;

export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
  locale: string;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', locale: 'en-IN' },
  { code: 'USD', symbol: '$', name: 'US Dollar', locale: 'en-US' },
  { code: 'EUR', symbol: '€', name: 'Euro', locale: 'de-DE' },
  { code: 'GBP', symbol: '£', name: 'British Pound', locale: 'en-GB' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', locale: 'ja-JP' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', locale: 'en-AU' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', locale: 'en-CA' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', locale: 'en-SG' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', locale: 'en-AE' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', locale: 'de-CH' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', locale: 'zh-CN' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar', locale: 'en-NZ' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand', locale: 'en-ZA' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', locale: 'pt-BR' },
];
export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as [string, ...string[]];
export const DEFAULT_CURRENCY = 'INR';

export interface DefaultCategory {
  name: string;
  icon: string;
  color: string;
  type: TransactionType;
}

/**
 * Seeded for every new user. Icons are lucide-react names (kebab-case).
 * Expense colours were validated as a categorical palette (lightness band, chroma floor,
 * colour-blind ΔE ≥ 9, normal-vision ΔE ≥ 15). "Others" is deliberately neutral grey.
 */
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: 'Food & Dining', icon: 'utensils', color: '#EA580C', type: 'expense' },
  { name: 'Shopping', icon: 'shopping-bag', color: '#DB2777', type: 'expense' },
  { name: 'Transportation', icon: 'car', color: '#0284C7', type: 'expense' },
  { name: 'Groceries', icon: 'shopping-cart', color: '#65A30D', type: 'expense' },
  { name: 'Entertainment', icon: 'clapperboard', color: '#7C3AED', type: 'expense' },
  { name: 'Healthcare', icon: 'heart-pulse', color: '#DC2626', type: 'expense' },
  { name: 'Bills & Utilities', icon: 'receipt', color: '#CA8A04', type: 'expense' },
  { name: 'Education', icon: 'graduation-cap', color: '#4F46E5', type: 'expense' },
  { name: 'Travel', icon: 'plane', color: '#0D9488', type: 'expense' },
  { name: 'Personal Care', icon: 'sparkles', color: '#C026D3', type: 'expense' },
  { name: 'Others', icon: 'circle-ellipsis', color: '#64748B', type: 'expense' },
  { name: 'Salary', icon: 'briefcase', color: '#16A34A', type: 'income' },
  { name: 'Freelance', icon: 'laptop', color: '#0891B2', type: 'income' },
  { name: 'Investments', icon: 'trending-up', color: '#2563EB', type: 'income' },
  { name: 'Gifts', icon: 'gift', color: '#DB2777', type: 'income' },
  { name: 'Others', icon: 'circle-ellipsis', color: '#64748B', type: 'income' },
];

export const FALLBACK_CATEGORY_NAME = 'Others';

/** Icons offered in the custom-category picker (must exist in the frontend icon map). */
export const CATEGORY_ICONS = [
  'utensils', 'coffee', 'pizza', 'shopping-bag', 'shopping-cart', 'shirt', 'car', 'bus', 'fuel', 'train-front',
  'plane', 'clapperboard', 'gamepad-2', 'music', 'heart-pulse', 'pill', 'dumbbell', 'receipt', 'zap', 'wifi',
  'smartphone', 'home', 'graduation-cap', 'book-open', 'sparkles', 'scissors', 'baby', 'dog', 'gift', 'briefcase',
  'laptop', 'trending-up', 'piggy-bank', 'landmark', 'wallet', 'circle-ellipsis',
] as const;

export const CATEGORY_COLORS = [
  '#F97316', '#EF4444', '#EC4899', '#D946EF', '#8B5CF6', '#6366F1', '#2563EB', '#0EA5E9',
  '#06B6D4', '#14B8A6', '#22C55E', '#84CC16', '#EAB308', '#F59E0B', '#78716C', '#64748B',
] as const;

export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const RECEIPT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
