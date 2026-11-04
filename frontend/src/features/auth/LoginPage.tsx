import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { loginSchema, type LoginInput } from '@expenseflow/shared';
import { toast } from 'sonner';
import { z } from 'zod';
import { PasswordInput } from '@/components/password-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { AuthHeading } from '@/layouts/AuthLayout';
import { ApiError, errorMessage } from '@/lib/api';
import { login } from './session';

type FormValues = z.input<typeof loginSchema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '', remember: true } });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const user = await login(values as LoginInput);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}!`);
      navigate(user.onboarded ? '/' : '/onboarding', { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'INVALID_CREDENTIALS') {
        setError('password', { message: 'Incorrect email or password' });
      } else {
        toast.error(errorMessage(e));
      }
    }
  });

  return (
    <>
      <AuthHeading title="Welcome back" subtitle="Sign in to continue to your finances." />
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" aria-invalid={!!errors.email} {...register('email')} />
        </Field>
        <Field
          label="Password"
          htmlFor="password"
          error={errors.password?.message}
          action={
            <Link to="/forgot-password" className="text-[13px] font-medium text-primary hover:underline">
              Forgot password?
            </Link>
          }
        >
          <PasswordInput id="password" autoComplete="current-password" placeholder="••••••••" aria-invalid={!!errors.password} {...register('password')} />
        </Field>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-muted-foreground">
          <input type="checkbox" className="h-4 w-4 rounded border-border accent-[rgb(var(--primary))]" {...register('remember')} />
          Keep me signed in for 30 days
        </label>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Sign in
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        New to ExpenseFlow?{' '}
        <Link to="/register" className="font-semibold text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
