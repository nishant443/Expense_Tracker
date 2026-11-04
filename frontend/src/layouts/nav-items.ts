import {
  ChartPie,
  House,
  ArrowLeftRight,
  LayoutGrid,
  PiggyBank,
  Repeat,
  Settings,
  UserRound,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

/** Mobile bottom navigation — five primary destinations, optimised for thumbs. */
export const MOBILE_NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: House },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/analytics', label: 'Statistics', icon: ChartPie },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank },
  { to: '/profile', label: 'Profile', icon: UserRound },
];

/** Desktop sidebar. */
export const DESKTOP_NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: House },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/categories', label: 'Categories', icon: LayoutGrid },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank },
  { to: '/analytics', label: 'Analytics', icon: ChartPie },
  { to: '/recurring', label: 'Recurring', icon: Repeat },
  { to: '/settings', label: 'Settings', icon: Settings },
];
