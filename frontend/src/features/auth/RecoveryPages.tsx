import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, MailCheck, XCircle } from 'lucide-react';
import { forgotPasswordSchema, passwordSchema } from '@expenseflow/shared';
import { toast } from 'sonner';
import { z } from 'zod';
import { PasswordInput, PasswordStrength } from '@/components/password-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { AuthHeading } from '@/layouts/AuthLayout';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/stores/auth';

function BackToLogin() {
  return (
    <Link to="/login" className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
      <ArrowLeft className="h-4 w-4" /> Back to sign in
    </Link>
  );
}

export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = handleSubmit(async ({ email }) => {
    try {
      await api.post('/auth/forgot-password', { email });
      setSentTo(email);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  if (sentTo) {
    return (
      <div className="text-center">
        <MailCheck className="mx-auto mb-5 h-12 w-12 text-primary" />
        <AuthHeading title="Check your inbox" subtitle={<>If an account exists for <b className="text-foreground">{sentTo}</b>, we've sent a link to reset your password. It expires in 1 hour.</>} />
        <BackToLogin />
      </div>
    );
  }

  return (
    <>
      <AuthHeading title="Forgot password?" subtitle="Enter your email and we'll send you a secure reset link." />
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" aria-invalid={!!errors.email} {...register('email')} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Send reset link
        </Button>
      </form>
      <BackToLogin />
    </>
  );
}

const resetForm = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof resetForm>>({ resolver: zodResolver(resetForm) });

  const onSubmit = handleSubmit(async ({ password }) => {
    try {
      await api.post('/auth/reset-password', { token, password });
      useAuth.getState().clear();
      toast.success('Password updated — please sign in.');
      navigate('/login', { replace: true });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  if (!token) {
    return (
      <>
        <AuthHeading title="Invalid link" subtitle="This password reset link is missing or malformed." />
        <Button asChild className="w-full">
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
      </>
    );
  }

  return (
    <>
      <AuthHeading title="Set a new password" subtitle="Choose a strong password you haven't used before." />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="New password" htmlFor="password" error={errors.password?.message}>
          <PasswordInput id="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register('password')} />
        </Field>
        <PasswordStrength password={watch('password') ?? ''} />
        <Field label="Confirm password" htmlFor="confirm" error={errors.confirm?.message}>
          <PasswordInput id="confirm" autoComplete="new-password" aria-invalid={!!errors.confirm} {...register('confirm')} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Update password
        </Button>
      </form>
      <BackToLogin />
    </>
  );
}

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'loading' | 'ok' | 'error'>(token ? 'loading' : 'error');
  const [message, setMessage] = useState('');
  const ran = useRef(false);
  const authed = useAuth((s) => s.status === 'authenticated');

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    api
      .post('/auth/verify-email', { token })
      .then(async () => {
        setState('ok');
        if (useAuth.getState().user) {
          const { user } = await api.get<{ user: import('@expenseflow/shared').UserDTO }>('/users/me');
          useAuth.getState().setUser(user);
        }
      })
      .catch((e) => {
        setState('error');
        setMessage(errorMessage(e));
      });
  }, [token]);

  return (
    <div className="text-center">
      {state === 'loading' && <AuthHeading title="Verifying…" subtitle="One moment while we confirm your email." />}
      {state === 'ok' && (
        <>
          <CheckCircle2 className="mx-auto mb-5 h-12 w-12 text-success" />
          <AuthHeading title="Email verified" subtitle="Thanks! Your account is fully set up." />
          <Button asChild size="lg" className="w-full">
            <Link to={authed ? '/' : '/login'}>{authed ? 'Go to dashboard' : 'Sign in'}</Link>
          </Button>
        </>
      )}
      {state === 'error' && (
        <>
          <XCircle className="mx-auto mb-5 h-12 w-12 text-danger" />
          <AuthHeading title="Link expired" subtitle={message || 'This verification link is invalid or has expired. Request a new one from your profile.'} />
          <Button asChild size="lg" variant="outline" className="w-full">
            <Link to={authed ? '/settings' : '/login'}>{authed ? 'Go to settings' : 'Sign in'}</Link>
          </Button>
        </>
      )}
    </div>
  );
}
