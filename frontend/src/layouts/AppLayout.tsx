import { Suspense } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, ChevronsLeft, ChevronsRight, LogOut, Plus, Settings, UserRound } from 'lucide-react';
import { Logo } from '@/components/logo';
import { SyncBadge, OfflineBanner } from '@/components/sync-status';
import { Avatar, Skeleton } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNotifications } from '@/features/data/hooks';
import { logout } from '@/features/auth/session';
import { VerifyEmailBanner } from '@/features/auth/VerifyEmailBanner';
import { api } from '@/lib/api';
import { cn, initials } from '@/lib/utils';
import { useUser } from '@/stores/auth';
import { useUi } from '@/stores/ui';
import { DESKTOP_NAV, MOBILE_NAV } from './nav-items';

function NotificationBell() {
  const { data } = useNotifications();
  const unread = data?.unread ?? 0;
  return (
    <Button asChild variant="ghost" size="icon" className="relative rounded-full">
      <Link to="/notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
        <Bell className="!size-5" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-background">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Link>
    </Button>
  );
}

function UserMenu() {
  const user = useUser();
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="press rounded-full" aria-label="Account menu">
        <Avatar src={user.avatarUrl ? api.url(user.avatarUrl) : null} fallback={initials(user.name)} className="h-9 w-9" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="truncate text-sm font-semibold text-foreground">{user.name}</div>
          <div className="truncate font-normal">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/profile')}>
          <UserRound /> Profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/settings')}>
          <Settings /> Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={() => void logout().then(() => navigate('/login'))}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Sidebar() {
  const { sidebarCollapsed: collapsed, toggleSidebar } = useUi();
  return (
    <aside
      className={cn(
        'sticky top-[var(--tb)] hidden h-[calc(100dvh-var(--tb))] shrink-0 flex-col border-r border-border/70 bg-surface/60 px-3 py-5 backdrop-blur transition-[width] duration-300 lg:flex',
        collapsed ? 'w-[76px]' : 'w-64',
      )}
    >
      <Link to="/" className={cn('mb-8 flex', collapsed ? 'justify-center' : 'px-2.5')}>
        <Logo collapsed={collapsed} />
      </Link>
      <Button asChild className={cn('mb-6', collapsed && 'px-0')}>
        <Link to="/transactions/new" aria-label="Add transaction">
          <Plus /> {!collapsed && 'Add transaction'}
        </Link>
      </Button>
      <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
        {DESKTOP_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              cn(
                'group relative flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                isActive && 'bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary',
                collapsed && 'justify-center px-0',
              )
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>
      <button
        onClick={toggleSidebar}
        className={cn('flex h-10 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted', collapsed && 'justify-center px-0')}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronsRight className="h-5 w-5" /> : <ChevronsLeft className="h-5 w-5" />}
        {!collapsed && 'Collapse'}
      </button>
    </aside>
  );
}

function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-surface/85 backdrop-blur-xl lg:hidden safe-bottom"
      aria-label="Main"
    >
      <div className="mx-auto grid h-16 max-w-lg grid-cols-5">
        {MOBILE_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn('relative flex flex-col items-center justify-center gap-1 text-[10.5px] font-medium text-muted-foreground transition-colors', isActive && 'text-primary')
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span layoutId="nav-pill" className="absolute top-1.5 h-8 w-14 rounded-full bg-primary/10" transition={{ type: 'spring', stiffness: 500, damping: 35 }} />
                )}
                <item.icon className="relative h-[22px] w-[22px]" strokeWidth={isActive ? 2.3 : 1.9} />
                <span className="relative">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function Fab() {
  const { pathname } = useLocation();
  const hidden = pathname.startsWith('/transactions/') || pathname === '/onboarding';
  return (
    <AnimatePresence>
      {!hidden && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)] right-4 z-40 lg:hidden"
        >
          <Link
            to="/transactions/new"
            aria-label="Add transaction"
            className="press flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-fab"
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} />
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PageFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

export function AppLayout() {
  const location = useLocation();
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-[var(--tb)] z-30 border-b border-transparent bg-background/80 backdrop-blur-xl safe-top">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 lg:h-16 lg:px-8">
            <Link to="/" className="lg:hidden" aria-label="ExpenseFlow home">
              <Logo className="[&_svg]:h-8 [&_svg]:w-8" />
            </Link>
            <div className="flex-1" />
            <SyncBadge />
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-32 pt-2 lg:px-8 lg:pb-12">
          <OfflineBanner />
          <VerifyEmailBanner />
          <Suspense fallback={<PageFallback />}>
            <motion.div key={location.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: 'easeOut' }}>
              <Outlet />
            </motion.div>
          </Suspense>
        </main>
      </div>
      <BottomNav />
      <Fab />
    </div>
  );
}
