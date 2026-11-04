import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, ChartPie, Laptop, Moon, PiggyBank, Repeat, Sun, WifiOff, type LucideIcon } from 'lucide-react';
import { CURRENCIES, parseMoneyInput, type Theme } from '@expenseflow/shared';
import { toast } from 'sonner';
import { LogoMark } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUpdateProfile } from '@/features/data/hooks';
import { errorMessage } from '@/lib/api';
import { currencySymbol } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useUser } from '@/stores/auth';
import { useUi } from '@/stores/ui';

const STEPS = ['welcome', 'currency', 'income', 'theme', 'tour'] as const;

const variants = {
  enter: (dir: number) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
};

export default function OnboardingPage() {
  const user = useUser();
  const navigate = useNavigate();
  const { setTheme } = useUi();
  const update = useUpdateProfile();
  const [[step, dir], setStep] = useState<[number, number]>([0, 1]);
  const [currency, setCurrency] = useState(user?.preferredCurrency ?? 'INR');
  const [income, setIncome] = useState('');
  const [theme, setThemeChoice] = useState<Theme>(useUi.getState().theme);

  const go = (delta: number) => setStep(([s]) => [Math.min(STEPS.length - 1, Math.max(0, s + delta)), delta]);
  const incomeValue = income ? parseMoneyInput(income) : null;
  const incomeInvalid = !!income && incomeValue === null;

  const finish = async () => {
    try {
      await update.mutateAsync({ preferredCurrency: currency, monthlyIncome: incomeValue, theme, completeOnboarding: true });
      navigate('/', { replace: true });
      toast.success("You're all set!", { description: 'Add your first transaction with the + button.' });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const current = STEPS[step]!;
  const optional = current === 'income';

  return (
    <div className="flex min-h-dvh flex-col bg-background safe-top">
      <header className="mx-auto flex w-full max-w-lg items-center gap-3 px-5 pt-5">
        {step > 0 ? (
          <Button variant="ghost" size="icon" onClick={() => go(-1)} aria-label="Back" className="-ml-2 rounded-full">
            <ArrowLeft className="!size-5" />
          </Button>
        ) : (
          <div className="h-10 w-10" />
        )}
        <div className="flex flex-1 gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1}>
          {STEPS.map((s, i) => (
            <div key={s} className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <motion.div className="h-full bg-primary" initial={false} animate={{ width: i <= step ? '100%' : '0%' }} transition={{ duration: 0.35 }} />
            </div>
          ))}
        </div>
        {optional ? (
          <Button variant="ghost" size="sm" onClick={() => (setIncome(''), go(1))}>
            Skip
          </Button>
        ) : (
          <div className="w-10" />
        )}
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col overflow-hidden px-5 pt-10">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.section
            key={current}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="flex-1"
          >
            {current === 'welcome' && (
              <div className="flex flex-col items-center pt-10 text-center">
                <motion.div initial={{ scale: 0.6, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
                  <LogoMark className="h-20 w-20 drop-shadow-xl" />
                </motion.div>
                <h1 className="mt-8 text-3xl font-bold tracking-tight">Hi {user?.name.split(' ')[0]}, welcome to ExpenseFlow</h1>
                <p className="mt-3 max-w-sm text-[15px] text-muted-foreground">
                  Let's personalise your experience. It takes less than 30 seconds.
                </p>
              </div>
            )}

            {current === 'currency' && (
              <>
                <StepHeading title="Your currency" subtitle="Used for all amounts. You can change it later." />
                <div className="grid grid-cols-2 gap-2.5 pb-6 sm:grid-cols-3">
                  {CURRENCIES.map((c) => (
                    <button
                      key={c.code}
                      onClick={() => setCurrency(c.code)}
                      className={cn(
                        'press relative flex flex-col items-start rounded-lg bg-surface p-3.5 text-left ring-1 ring-border transition',
                        currency === c.code && 'ring-2 ring-primary',
                      )}
                      aria-pressed={currency === c.code}
                    >
                      <span className="text-xl font-semibold">{c.symbol}</span>
                      <span className="mt-1 text-sm font-semibold">{c.code}</span>
                      <span className="truncate text-xs text-muted-foreground">{c.name}</span>
                      {currency === c.code && <Check className="absolute right-3 top-3 h-4 w-4 text-primary" />}
                    </button>
                  ))}
                </div>
              </>
            )}

            {current === 'income' && (
              <>
                <StepHeading title="Monthly income" subtitle="Optional — helps us show savings goals and insights." />
                <div className="rounded-xl bg-surface p-6 ring-1 ring-border">
                  <label htmlFor="income" className="text-[13px] font-medium text-muted-foreground">
                    Monthly take-home income
                  </label>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-3xl font-semibold text-muted-foreground">{currencySymbol(currency)}</span>
                    <Input
                      id="income"
                      autoFocus
                      inputMode="decimal"
                      placeholder="0"
                      value={income}
                      onChange={(e) => setIncome(e.target.value)}
                      aria-invalid={incomeInvalid}
                      className="num h-14 border-0 bg-transparent px-0 text-4xl font-bold shadow-none focus-visible:ring-0"
                    />
                  </div>
                  {incomeInvalid && <p className="mt-2 text-sm text-danger">Enter a valid amount</p>}
                </div>
              </>
            )}

            {current === 'theme' && (
              <>
                <StepHeading title="Choose your look" subtitle="Switch anytime from settings." />
                <div className="grid grid-cols-3 gap-3">
                  {([
                    ['light', 'Light', Sun],
                    ['dark', 'Dark', Moon],
                    ['system', 'System', Laptop],
                  ] as [Theme, string, LucideIcon][]).map(([value, label, Icon]) => (
                    <button
                      key={value}
                      onClick={() => {
                        setThemeChoice(value);
                        setTheme(value);
                      }}
                      className={cn('press overflow-hidden rounded-xl bg-surface ring-1 ring-border transition', theme === value && 'ring-2 ring-primary')}
                      aria-pressed={theme === value}
                    >
                      <ThemePreview mode={value} />
                      <div className="flex items-center justify-center gap-1.5 py-3 text-sm font-semibold">
                        <Icon className="h-4 w-4" /> {label}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}

            {current === 'tour' && (
              <>
                <StepHeading title="Your dashboard at a glance" subtitle="Here's what you can do with ExpenseFlow." />
                <ul className="space-y-3">
                  {[
                    [ChartPie, 'Smart insights', 'See where money goes with charts and data-driven tips.'],
                    [PiggyBank, 'Budgets that warn you', 'Get alerts at 70%, 90% and 100% of any budget.'],
                    [Repeat, 'Recurring transactions', 'Rent, salary and subscriptions — recorded automatically.'],
                    [WifiOff, 'Offline-first', 'Add expenses anywhere. Everything syncs when you reconnect.'],
                  ].map(([Icon, title, text], i) => (
                    <motion.li
                      key={title as string}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.08 * i }}
                      className="flex gap-4 rounded-xl bg-surface p-4 ring-1 ring-border"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        {(() => {
                          const I = Icon as LucideIcon;
                          return <I className="h-5 w-5" />;
                        })()}
                      </span>
                      <div>
                        <p className="font-semibold">{title as string}</p>
                        <p className="text-sm text-muted-foreground">{text as string}</p>
                      </div>
                    </motion.li>
                  ))}
                </ul>
              </>
            )}
          </motion.section>
        </AnimatePresence>
      </main>

      <footer className="mx-auto w-full max-w-lg px-5 pb-8 pt-4 safe-bottom">
        {step < STEPS.length - 1 ? (
          <Button size="lg" className="w-full" onClick={() => go(1)} disabled={incomeInvalid}>
            {step === 0 ? "Let's go" : 'Continue'} <ArrowRight />
          </Button>
        ) : (
          <Button size="lg" className="w-full" onClick={finish} loading={update.isPending}>
            Go to my dashboard <ArrowRight />
          </Button>
        )}
      </footer>
    </div>
  );
}

function StepHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-[26px] font-bold tracking-tight">{title}</h1>
      <p className="mt-1.5 text-[15px] text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function ThemePreview({ mode }: { mode: Theme }) {
  const half = (dark: boolean) => (
    <div className={cn('flex h-full flex-1 flex-col gap-1.5 p-2.5', dark ? 'bg-[#0B0F19]' : 'bg-[#F7F8FA]')}>
      <div className={cn('h-5 rounded-md', dark ? 'bg-[#1F2937]' : 'bg-white shadow-sm')} />
      <div className={cn('h-2 w-2/3 rounded', dark ? 'bg-[#374151]' : 'bg-[#E5E7EB]')} />
      <div className={cn('h-2 w-1/2 rounded', dark ? 'bg-[#60A5FA]' : 'bg-[#2563EB]')} />
    </div>
  );
  return <div className="flex h-24">{mode === 'system' ? (<>{half(false)}{half(true)}</>) : half(mode === 'dark')}</div>;
}
