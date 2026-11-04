import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Camera, Download, FileSpreadsheet, FileText, Sheet, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  AVATAR_MAX_BYTES,
  CURRENCIES,
  localTodayISO,
  parseMoneyInput,
  passwordSchema,
  presetRange,
  type Theme,
  type UserDTO,
} from '@expenseflow/shared';
import { PasswordInput, PasswordStrength } from '@/components/password-input';
import { PageHeader } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Avatar, Switch } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { logout, updateCachedUser } from '@/features/auth/session';
import { useUpdateProfile } from '@/features/data/hooks';
import { api, ApiError, errorMessage } from '@/lib/api';
import { clearLocalData } from '@/lib/db';
import { queryClient } from '@/lib/query-client';
import { cn, downloadBlob, initials } from '@/lib/utils';
import { useAuth, useUser } from '@/stores/auth';
import { useSyncStore } from '@/stores/sync';
import { useUi } from '@/stores/ui';

export default function SettingsPage() {
  const user = useUser();
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash]);
  if (!user) return null;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" subtitle="Manage your account and preferences" />
      <div className="space-y-5">
        <AccountSection user={user} />
        <PreferencesSection user={user} />
        <NotificationsSection user={user} />
        <ExportSection />
        <SecuritySection user={user} />
        <DangerZone />
      </div>
    </div>
  );
}

function Section({ id, title, description, children }: { id?: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-24 p-5">
      <h2 className="text-title">{title}</h2>
      {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
      <div className="mt-5">{children}</div>
    </Card>
  );
}

// ───────────────────────── account ─────────────────────────

function AccountSection({ user }: { user: UserDTO }) {
  const [name, setName] = useState(user.name);
  const update = useUpdateProfile();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const online = useSyncStore((s) => s.online);

  const uploadAvatar = async (f?: File) => {
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) return toast.error('Use a JPG, PNG or WebP image');
    if (f.size > AVATAR_MAX_BYTES) return toast.error('Image must be under 2 MB');
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', f);
      const { user: u } = await api.post<{ user: UserDTO }>('/users/me/avatar', form);
      updateCachedUser(u);
      toast.success('Profile photo updated');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeAvatar = async () => {
    try {
      const { user: u } = await api.delete<{ user: UserDTO }>('/users/me/avatar');
      updateCachedUser(u);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Section title="Account">
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={!online || uploading} className="group relative rounded-full" aria-label="Change profile photo">
          <Avatar src={user.avatarUrl ? api.url(user.avatarUrl) : null} fallback={initials(user.name)} className="h-16 w-16 text-lg" />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition group-hover:opacity-100">
            <Camera className="h-5 w-5" />
          </span>
        </button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} loading={uploading} disabled={!online}>Upload photo</Button>
          {user.avatarUrl && <Button variant="ghost" size="sm" onClick={removeAvatar} disabled={!online}>Remove</Button>}
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void uploadAvatar(e.target.files?.[0])} />
      </div>
      <div className="mt-5 space-y-4">
        <Field label="Full name" htmlFor="s-name">
          <div className="flex gap-2">
            <Input id="s-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            <Button
              variant="secondary"
              disabled={!name.trim() || name.trim() === user.name}
              loading={update.isPending}
              onClick={() => update.mutate({ name: name.trim() }, { onSuccess: () => toast.success('Name updated'), onError: (e) => toast.error(errorMessage(e)) })}
            >
              Save
            </Button>
          </div>
        </Field>
        <Field label="Email" hint={user.emailVerified ? 'Verified' : 'Not verified yet — check your inbox'}>
          <div className="flex gap-2">
            <Input value={user.email} readOnly className="bg-muted/50" />
            <Button variant="secondary" onClick={() => setEmailOpen(true)}>Change</Button>
          </div>
        </Field>
      </div>
      <ChangeEmailDialog open={emailOpen} onOpenChange={setEmailOpen} />
    </Section>
  );
}

function ChangeEmailDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.post<{ user: UserDTO }>('/users/me/email', { email, password });
      updateCachedUser(user);
      toast.success('Email updated', { description: 'Check your inbox to verify the new address.' });
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>Change email</DialogTitle>
            <DialogDescription>We'll send a verification link to the new address.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <Field label="New email" htmlFor="ce-email"><Input id="ce-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Current password" htmlFor="ce-pw" error={error ?? undefined}><PasswordInput id="ce-pw" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Update email</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── preferences ─────────────────────────

function PreferencesSection({ user }: { user: UserDTO }) {
  const update = useUpdateProfile();
  const { setTheme } = useUi();
  const [income, setIncome] = useState(user.monthlyIncome?.replace(/\.00$/, '') ?? '');
  const parsed = income ? parseMoneyInput(income) : null;
  const save = (patch: Record<string, unknown>, msg = 'Preferences saved') =>
    update.mutate(patch, { onSuccess: () => toast.success(msg), onError: (e) => toast.error(errorMessage(e)) });

  return (
    <Section title="Preferences">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Currency">
          <Select value={user.preferredCurrency} onValueChange={(v) => save({ preferredCurrency: v }, 'Currency updated')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code} — {c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Theme">
          <Select value={user.theme} onValueChange={(v) => { setTheme(v as Theme); save({ theme: v }, 'Theme updated'); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="system">System default</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Monthly income" htmlFor="s-income" error={income && parsed === null ? 'Enter a valid amount' : undefined} hint="Optional — used for savings insights" className="sm:col-span-2">
          <div className="flex gap-2">
            <Input id="s-income" inputMode="decimal" className="num" value={income} placeholder="0.00" onChange={(e) => setIncome(e.target.value)} />
            <Button variant="secondary" disabled={!!income && parsed === null} onClick={() => save({ monthlyIncome: parsed }, 'Income updated')}>Save</Button>
          </div>
        </Field>
      </div>
    </Section>
  );
}

// ───────────────────────── notifications ─────────────────────────

function NotificationsSection({ user }: { user: UserDTO }) {
  const update = useUpdateProfile();
  const [thresholds, setThresholds] = useState(user.alertThresholds.join(', '));
  const parsed = thresholds
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(Number);
  const valid = parsed.length > 0 && parsed.length <= 5 && parsed.every((n) => Number.isInteger(n) && n >= 1 && n <= 200);
  const setPref = (key: keyof UserDTO['notificationPrefs'], value: boolean) =>
    update.mutate({ notificationPrefs: { ...user.notificationPrefs, [key]: value } }, { onError: (e) => toast.error(errorMessage(e)) });

  const rows: { key: keyof UserDTO['notificationPrefs']; label: string; hint: string }[] = [
    { key: 'budgetAlerts', label: 'Budget alerts', hint: 'Notify me when a budget crosses a threshold' },
    { key: 'recurringActivity', label: 'Recurring activity', hint: 'Notify me when recurring transactions are recorded' },
  ];

  return (
    <Section id="alerts" title="Notifications & alerts">
      <div className="space-y-4">
        {rows.map((r) => (
          <label key={r.key} className="flex cursor-pointer items-center justify-between gap-4">
            <span>
              <span className="block text-sm font-medium">{r.label}</span>
              <span className="block text-[13px] text-muted-foreground">{r.hint}</span>
            </span>
            <Switch checked={user.notificationPrefs[r.key]} onCheckedChange={(v) => setPref(r.key, v)} />
          </label>
        ))}
        <Field label="Budget alert thresholds (%)" htmlFor="s-thr" error={valid ? undefined : 'Enter 1–5 whole numbers between 1 and 200'} hint="Each threshold alerts once per budget period">
          <div className="flex gap-2">
            <Input id="s-thr" value={thresholds} onChange={(e) => setThresholds(e.target.value)} placeholder="70, 90, 100" />
            <Button variant="secondary" disabled={!valid} onClick={() => update.mutate({ alertThresholds: parsed }, { onSuccess: () => toast.success('Thresholds saved'), onError: (e) => toast.error(errorMessage(e)) })}>Save</Button>
          </div>
        </Field>
      </div>
    </Section>
  );
}

// ───────────────────────── export ─────────────────────────

function ExportSection() {
  const [range, setRange] = useState<'all' | 'this_month' | 'last_month' | 'this_year'>('this_month');
  const [busy, setBusy] = useState<string | null>(null);
  const online = useSyncStore((s) => s.online);

  const run = async (format: 'csv' | 'xlsx' | 'pdf') => {
    setBusy(format);
    try {
      const w = range === 'all' ? null : presetRange(range, localTodayISO());
      const res = await api.get<Response>('/export/transactions', { query: { format, from: w?.start, to: w?.end }, raw: true });
      const blob = await res.blob();
      const name = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? `expenseflow.${format}`;
      downloadBlob(blob, name);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const formats = [
    { id: 'csv' as const, label: 'CSV', icon: Sheet, hint: 'Universal' },
    { id: 'xlsx' as const, label: 'Excel', icon: FileSpreadsheet, hint: '.xlsx' },
    { id: 'pdf' as const, label: 'PDF report', icon: FileText, hint: 'Printable' },
  ];

  return (
    <Section id="export" title="Export data" description="Download your transactions. Exports only ever include your own data.">
      <Field label="Period">
        <Select value={range} onValueChange={(v) => setRange(v as typeof range)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="this_month">This month</SelectItem>
            <SelectItem value="last_month">Last month</SelectItem>
            <SelectItem value="this_year">This year</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {formats.map((f) => (
          <button
            key={f.id}
            onClick={() => void run(f.id)}
            disabled={!online || !!busy}
            className="press flex flex-col items-center gap-1.5 rounded-lg p-4 ring-1 ring-border transition hover:bg-muted disabled:opacity-50"
          >
            {busy === f.id ? <Download className="h-5 w-5 animate-bounce text-primary" /> : <f.icon className="h-5 w-5 text-primary" />}
            <span className="text-sm font-semibold">{f.label}</span>
            <span className="text-xs text-muted-foreground">{f.hint}</span>
          </button>
        ))}
      </div>
      {!online && <p className="mt-2 text-xs text-muted-foreground">Exports require a connection.</p>}
    </Section>
  );
}

// ───────────────────────── security ─────────────────────────

const pwSchema = z
  .object({ currentPassword: z.string().min(1, 'Required'), newPassword: passwordSchema, confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });

function SecuritySection({ user }: { user: UserDTO }) {
  const navigate = useNavigate();
  const { register, handleSubmit, reset, watch, setError, formState: { errors, isSubmitting } } = useForm<z.infer<typeof pwSchema>>({ resolver: zodResolver(pwSchema) });
  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      await api.post('/users/me/password', { currentPassword, newPassword });
      toast.success('Password changed', { description: 'Other devices were signed out.' });
      reset({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors.currentPassword) setError('currentPassword', { message: e.fieldErrors.currentPassword[0] });
      else toast.error(errorMessage(e));
    }
  });

  const signOutEverywhere = async () => {
    try {
      await api.post('/auth/logout-all');
    } finally {
      await clearLocalData();
      queryClient.clear();
      useAuth.getState().clear();
      navigate('/login');
    }
  };

  return (
    <Section title="Security" description={`Signed in as ${user.email}`}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Current password" htmlFor="pw-cur" error={errors.currentPassword?.message}>
          <PasswordInput id="pw-cur" autoComplete="current-password" {...register('currentPassword')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New password" htmlFor="pw-new" error={errors.newPassword?.message}>
            <PasswordInput id="pw-new" autoComplete="new-password" {...register('newPassword')} />
          </Field>
          <Field label="Confirm new password" htmlFor="pw-conf" error={errors.confirm?.message}>
            <PasswordInput id="pw-conf" autoComplete="new-password" {...register('confirm')} />
          </Field>
        </div>
        <PasswordStrength password={watch('newPassword') ?? ''} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={isSubmitting}>Change password</Button>
          <Button type="button" variant="outline" onClick={() => void signOutEverywhere()}>Sign out of all devices</Button>
        </div>
      </form>
    </Section>
  );
}

// ───────────────────────── danger zone ─────────────────────────

function DangerZone() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.delete('/users/me', { password });
      await logout().catch(() => {});
      toast.success('Your account and all data were deleted.');
      navigate('/register', { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border border-danger/30 p-5 ring-0">
      <h2 className="flex items-center gap-2 text-title text-danger"><TriangleAlert className="h-5 w-5" /> Danger zone</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">Permanently delete your account, transactions, budgets and files. This cannot be undone.</p>
      <Button variant="destructive" className="mt-4" onClick={() => setOpen(true)}>Delete account</Button>
      <Dialog open={open} onOpenChange={(o) => (setOpen(o), setPassword(''), setConfirmText(''), setError(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>All of your data will be permanently erased. Export it first if you want a copy.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <Field label={<>Type <b>DELETE</b> to confirm</>} htmlFor="del-confirm"><Input id="del-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" /></Field>
            <Field label="Password" htmlFor="del-pw" error={error ?? undefined}><PasswordInput id="del-pw" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={confirmText !== 'DELETE' || !password} loading={busy} onClick={() => void remove()} className={cn(confirmText !== 'DELETE' && 'opacity-60')}>
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
