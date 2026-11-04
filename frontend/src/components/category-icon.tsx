import {
  ArrowDownRight,
  ArrowUpRight,
  Baby,
  BookOpen,
  Briefcase,
  Bus,
  Calendar,
  Car,
  CircleEllipsis,
  Clapperboard,
  Coffee,
  Dog,
  Dumbbell,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  Laptop,
  Music,
  PiggyBank,
  Pill,
  Pizza,
  Plane,
  Receipt,
  Scissors,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  TrainFront,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Utensils,
  Wallet,
  Wifi,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export const ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  coffee: Coffee,
  pizza: Pizza,
  'shopping-bag': ShoppingBag,
  'shopping-cart': ShoppingCart,
  shirt: Shirt,
  car: Car,
  bus: Bus,
  fuel: Fuel,
  'train-front': TrainFront,
  plane: Plane,
  clapperboard: Clapperboard,
  'gamepad-2': Gamepad2,
  music: Music,
  'heart-pulse': HeartPulse,
  pill: Pill,
  dumbbell: Dumbbell,
  receipt: Receipt,
  zap: Zap,
  wifi: Wifi,
  smartphone: Smartphone,
  home: House,
  'graduation-cap': GraduationCap,
  'book-open': BookOpen,
  sparkles: Sparkles,
  scissors: Scissors,
  baby: Baby,
  dog: Dog,
  gift: Gift,
  briefcase: Briefcase,
  laptop: Laptop,
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
  'piggy-bank': PiggyBank,
  landmark: Landmark,
  wallet: Wallet,
  'circle-ellipsis': CircleEllipsis,
  'alert-triangle': TriangleAlert,
  'arrow-up-right': ArrowUpRight,
  'arrow-down-right': ArrowDownRight,
  calendar: Calendar,
};

export function iconFor(name: string | undefined): LucideIcon {
  return (name && ICONS[name]) || CircleEllipsis;
}

/** Tinted rounded tile with the category icon in the category colour. */
export function CategoryIcon({
  icon,
  color = '#64748B',
  size = 'md',
  className,
}: {
  icon?: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const Icon = iconFor(icon);
  const dims = size === 'sm' ? 'h-8 w-8 rounded-[10px]' : size === 'lg' ? 'h-12 w-12 rounded-[14px]' : 'h-10 w-10 rounded-xl';
  const iconSize = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-6 w-6' : 'h-5 w-5';
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center', dims, className)} style={{ backgroundColor: `${color}1A`, color }} aria-hidden>
      <Icon className={iconSize} strokeWidth={2} />
    </span>
  );
}
