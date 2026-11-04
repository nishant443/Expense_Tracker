import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { registerSchema } from '@expenseflow/shared';
import { toast } from 'sonner';
import { z } from 'zod';
import { PasswordInput, PasswordStrength } from '@/components/password-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { AuthHeading } from '@/layouts/AuthLayout';
import { ApiError, errorMessage } from '@/lib/api';
import { register as registerAccount } from './session';

const formSchema = registerSchema
  .extend({ confirmPassword: z.string().min(1, 'Please confirm your password'), acceptTerms: z.boolean() })
  .refine((v) => v.password === v.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] })
  .refine((v) => v.acceptTerms, { message: 'Please accept the terms to continue', path: ['acceptTerms'] });

type FormValues = z.input<typeof formSchema>;

export default function RegisterPage() {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '', acceptTerms: false },
  });
  const password = watch('password');

  const onSubmit = handleSubmit(async ({ name, email, password }) => {
    try {
      await registerAccount({ name, email, password, acceptTerms: true });
      navigate('/onboarding', { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'EMAIL_TAKEN') setError('email', { message: e.message });
      else if (e instanceof ApiError && Object.keys(e.fieldErrors).length) {
        for (const [k, v] of Object.entries(e.fieldErrors)) setError(k as keyof FormValues, { message: v[0] });
      } else toast.error(errorMessage(e));
    }
  });

  return (
    <>
      <AuthHeading title="Create your account" subtitle="Start tracking smarter in under a minute." />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Full name" htmlFor="name" error={errors.name?.message}>
          <Input id="name" autoComplete="name" placeholder="Priya Sharma" aria-invalid={!!errors.name} {...register('name')} />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" aria-invalid={!!errors.email} {...register('email')} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <PasswordInput id="password" autoComplete="new-password" placeholder="At least 8 characters" aria-invalid={!!errors.password} {...register('password')} />
        </Field>
        <PasswordStrength password={password} />
        <Field label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword?.message}>
          <PasswordInput id="confirmPassword" autoComplete="new-password" aria-invalid={!!errors.confirmPassword} {...register('confirmPassword')} />
        </Field>
        <Field error={errors.acceptTerms?.message}>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-muted-foreground">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded accent-[rgb(var(--primary))]" {...register('acceptTerms')} />
            <span>
              I agree to the <span className="font-medium text-foreground">Terms of Service</span> and{' '}
              <span className="font-medium text-foreground">Privacy Policy</span>.
            </span>
          </label>
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Create account
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
