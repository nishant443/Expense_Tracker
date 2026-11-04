import { useState } from 'react';
import { MailWarning } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { useUser } from '@/stores/auth';

export function VerifyEmailBanner() {
  const user = useUser();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!user || user.emailVerified) return null;

  const resend = async () => {
    setBusy(true);
    try {
      await api.post('/auth/resend-verification');
      setSent(true);
      toast.success('Verification email sent');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg bg-primary/[0.06] px-3.5 py-2.5 text-[13px] ring-1 ring-primary/10">
      <MailWarning className="h-4 w-4 shrink-0 text-primary" />
      <p className="flex-1 text-muted-foreground">
        Please verify <span className="font-medium text-foreground">{user.email}</span> to secure your account.
      </p>
      <Button size="sm" variant="ghost" className="h-8 text-primary" onClick={resend} loading={busy} disabled={sent}>
        {sent ? 'Sent' : 'Resend'}
      </Button>
    </div>
  );
}
