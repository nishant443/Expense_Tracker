import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Download, LayoutGrid, LogOut, Moon, Repeat, Settings, ShieldCheck, Smartphone, Sun, Laptop, type LucideIcon } from 'lucide-react';
import type { Theme } from '@expenseflow/shared';
import { InstallGuideDialog } from '@/components/install-prompt';
import { Card } from '@/components/ui/card';
import { Avatar, Badge } from '@/components/ui/misc';
import { useUpdateProfile } from '@/features/data/hooks';
import { logout } from '@/features/auth/session';
import { useInstallPrompt } from '@/hooks/use-install-prompt';
import { api } from '@/lib/api';
import { cn, initials } from '@/lib/utils';
import { useUser } from '@/stores/auth';
import { useUi } from '@/stores/ui';

/** Mobile hub for everything not in the bottom nav. */
export default function ProfilePage() {
  const user = useUser();
  const navigate = useNavigate();
  const { theme, setTheme } = useUi();
  const update = useUpdateProfile();
  const install = useInstallPrompt();
  const [guide, setGuide] = useState(false);
  if (!user) return null;

  const changeTheme = (t: Theme) => {
    setTheme(t);
    update.mutate({ theme: t });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Card className="flex items-center gap-4 p-5">
        <Avatar src={user.avatarUrl ? api.url(user.avatarUrl) : null} fallback={initials(user.name)} className="h-16 w-16 text-lg" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold">{user.name}</h1>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          <div className="mt-1.5 flex gap-1.5">
            <Badge variant="muted">{user.preferredCurrency}</Badge>
            {user.emailVerified ? <Badge variant="success"><ShieldCheck className="h-3 w-3" /> Verified</Badge> : <Badge variant="warning">Unverified</Badge>}
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <p className="mb-3 text-sm font-semibold">Appearance</p>
        <div className="grid grid-cols-3 gap-2">
          {([['light', 'Light', Sun], ['dark', 'Dark', Moon], ['system', 'System', Laptop]] as [Theme, string, LucideIcon][]).map(([v, l, I]) => (
            <button key={v} onClick={() => changeTheme(v)} aria-pressed={theme === v} className={cn('press flex h-11 items-center justify-center gap-2 rounded-md text-sm font-semibold ring-1 ring-border', theme === v ? 'bg-primary text-primary-foreground ring-primary' : 'bg-surface')}>
              <I className="h-4 w-4" /> {l}
            </button>
          ))}
        </div>
      </Card>

      <Card className="divide-y divide-border/60 overflow-hidden">
        <Row icon={LayoutGrid} label="Categories" to="/categories" />
        <Row icon={Repeat} label="Recurring transactions" to="/recurring" />
        <Row icon={Download} label="Export data" to="/settings#export" />
        <Row icon={Settings} label="Settings" to="/settings" />
        {!install.installed && <Row icon={Smartphone} label="Install app" onClick={async () => (install.canPrompt ? await install.prompt() : setGuide(true))} />}
      </Card>

      <Card className="overflow-hidden">
        <Row icon={LogOut} label="Sign out" danger onClick={() => void logout().then(() => navigate('/login'))} />
      </Card>
      <p className="text-center text-xs text-muted-foreground">ExpenseFlow v{__APP_VERSION__}</p>
      <InstallGuideDialog open={guide} onOpenChange={setGuide} />
    </div>
  );
}

function Row({ icon: Icon, label, to, onClick, danger }: { icon: LucideIcon; label: string; to?: string; onClick?: () => void; danger?: boolean }) {
  const content = (
    <>
      <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', danger ? 'bg-danger-soft text-danger' : 'bg-muted text-foreground')}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className={cn('flex-1 text-left text-[15px] font-medium', danger && 'text-danger')}>{label}</span>
      {!danger && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
    </>
  );
  const cls = 'flex w-full items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60 active:bg-muted';
  return to ? <Link to={to} className={cls}>{content}</Link> : <button onClick={onClick} className={cls}>{content}</button>;
}
