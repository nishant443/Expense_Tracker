import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck, WifiOff, Zap } from 'lucide-react';
import { Logo } from '@/components/logo';

const FEATURES = [
  { icon: Zap, title: 'Log in seconds', text: 'A fast entry flow built for one-handed use.' },
  { icon: WifiOff, title: 'Works offline', text: 'Add expenses anywhere; they sync automatically.' },
  { icon: ShieldCheck, title: 'Private by design', text: 'Secure sessions, encrypted transport, your data only.' },
];

/** Split layout: brand panel on desktop, focused single column on mobile. */
export function AuthLayout() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[#0B1220] p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-blue-600/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 right-0 h-[26rem] w-[26rem] rounded-full bg-indigo-500/20 blur-3xl" />
        <Logo className="relative" />
        <div className="relative mt-auto max-w-md">
          <h2 className="text-4xl font-bold leading-tight tracking-tight">
            Money, in flow.
            <span className="block text-blue-300/90">Clarity in every rupee.</span>
          </h2>
          <ul className="mt-10 space-y-5">
            {FEATURES.map((f, i) => (
              <motion.li
                key={f.title}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.1 }}
                className="flex gap-4"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                  <f.icon className="h-5 w-5 text-blue-200" />
                </span>
                <div>
                  <p className="font-semibold">{f.title}</p>
                  <p className="text-sm text-white/60">{f.text}</p>
                </div>
              </motion.li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-white/40">© {new Date().getFullYear()} ExpenseFlow</p>
      </aside>
      <main className="flex flex-col px-5 py-8 sm:px-8 safe-top">
        <Logo className="mb-10 lg:hidden" />
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center pb-10">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <Outlet />
          </motion.div>
        </div>
      </main>
    </div>
  );
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle?: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="text-[28px] font-bold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-2 text-[15px] text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
