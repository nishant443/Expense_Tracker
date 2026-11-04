import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, EllipsisVertical, MonitorDown, PlusSquare, Share, Smartphone, X } from 'lucide-react';
import { useInstallPrompt, type Platform } from '@/hooks/use-install-prompt';
import { useUi } from '@/stores/ui';
import { LogoMark } from './logo';
import { Button } from './ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

const STEPS: Record<Platform, { title: string; steps: { icon: React.ReactNode; text: React.ReactNode }[] }> = {
  ios: {
    title: 'Install on iPhone or iPad',
    steps: [
      { icon: <Share className="h-4 w-4" />, text: <>Open ExpenseFlow in <b>Safari</b> and tap the <b>Share</b> button in the toolbar.</> },
      { icon: <PlusSquare className="h-4 w-4" />, text: <>Scroll and tap <b>Add to Home Screen</b>.</> },
      { icon: <Smartphone className="h-4 w-4" />, text: <>Tap <b>Add</b>. ExpenseFlow opens full-screen like a native app.</> },
    ],
  },
  android: {
    title: 'Install on Android',
    steps: [
      { icon: <EllipsisVertical className="h-4 w-4" />, text: <>Open the browser menu (<b>⋮</b> in Chrome, <b>≡</b> in Samsung Internet).</> },
      { icon: <Download className="h-4 w-4" />, text: <>Tap <b>Install app</b> or <b>Add to Home screen</b>.</> },
      { icon: <Smartphone className="h-4 w-4" />, text: <>Confirm. The app appears in your app drawer — no Play Store needed.</> },
    ],
  },
  'mac-safari': {
    title: 'Install on Mac (Safari)',
    steps: [
      { icon: <Share className="h-4 w-4" />, text: <>Click <b>Share</b> in the Safari toolbar, or open the <b>File</b> menu.</> },
      { icon: <PlusSquare className="h-4 w-4" />, text: <>Choose <b>Add to Dock…</b> and confirm.</> },
    ],
  },
  desktop: {
    title: 'Install on desktop',
    steps: [
      { icon: <MonitorDown className="h-4 w-4" />, text: <>In Chrome or Edge, click the <b>install icon</b> at the right of the address bar.</> },
      { icon: <EllipsisVertical className="h-4 w-4" />, text: <>Or open the browser menu and choose <b>Install ExpenseFlow</b>.</> },
    ],
  },
};

export function InstallGuideDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { platform } = useInstallPrompt();
  const guide = STEPS[platform];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{guide.title}</DialogTitle>
          <DialogDescription>Add ExpenseFlow to your home screen for a fast, offline-ready experience.</DialogDescription>
        </DialogHeader>
        <DialogBody className="pb-6">
          <ol className="space-y-3">
            {guide.steps.map((s, i) => (
              <li key={i} className="flex gap-3 rounded-lg bg-muted/60 p-3.5 text-sm">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">{s.icon}</span>
                <span className="pt-1 leading-relaxed">{s.text}</span>
              </li>
            ))}
          </ol>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/** Dismissible install card; uses the native prompt where available, otherwise the guide. */
export function InstallPromptCard() {
  const { canPrompt, installed, prompt } = useInstallPrompt();
  const { installDismissedAt, dismissInstall } = useUi();
  const [guideOpen, setGuideOpen] = useState(false);
  const recentlyDismissed = installDismissedAt && Date.now() - installDismissedAt < 14 * 86_400_000;
  const visible = !installed && !recentlyDismissed;

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="mb-4 flex items-center gap-3 overflow-hidden rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-3.5 ring-1 ring-primary/15"
          >
            <LogoMark className="h-10 w-10 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Install ExpenseFlow</p>
              <p className="truncate text-xs text-muted-foreground">Works offline · Opens instantly · No app store</p>
            </div>
            <Button size="sm" onClick={async () => (canPrompt ? await prompt() : setGuideOpen(true))}>
              Install
            </Button>
            <button onClick={dismissInstall} className="rounded-full p-1 text-muted-foreground hover:bg-muted" aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <InstallGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
    </>
  );
}
