import { lazy, Suspense, useEffect } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Toaster } from 'sonner';
import { Splash, GuestOnly, RequireAuth } from '@/features/auth/guards';
import { bootstrapSession } from '@/features/auth/session';
import { AppLayout } from '@/layouts/AppLayout';
import { AuthLayout } from '@/layouts/AuthLayout';
import { idbPersister, queryClient } from '@/lib/query-client';
import { startSyncEngine } from '@/services/sync-engine';
import { useAuth } from '@/stores/auth';
import { applyTheme, useUi } from '@/stores/ui';
import { UpdatePrompt } from '@/components/update-prompt';

// Route-level code splitting: each page is its own chunk.
const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const RegisterPage = lazy(() => import('@/features/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('@/features/auth/RecoveryPages').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('@/features/auth/RecoveryPages').then((m) => ({ default: m.ResetPasswordPage })));
const VerifyEmailPage = lazy(() => import('@/features/auth/RecoveryPages').then((m) => ({ default: m.VerifyEmailPage })));
const OnboardingPage = lazy(() => import('@/features/onboarding/OnboardingPage'));
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'));
const TransactionsPage = lazy(() => import('@/features/transactions/TransactionsPage'));
const TransactionFormPage = lazy(() => import('@/features/transactions/TransactionFormPage'));
const AnalyticsPage = lazy(() => import('@/features/analytics/AnalyticsPage'));
const BudgetsPage = lazy(() => import('@/features/budgets/BudgetsPage'));
const CategoriesPage = lazy(() => import('@/features/categories/CategoriesPage'));
const RecurringPage = lazy(() => import('@/features/recurring/RecurringPage'));
const NotificationsPage = lazy(() => import('@/features/notifications/NotificationsPage'));
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage'));
const SettingsPage = lazy(() => import('@/features/profile/SettingsPage'));

const router = createBrowserRouter([
  {
    element: <GuestOnly />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
        ],
      },
    ],
  },
  {
    element: <AuthLayout />,
    children: [
      { path: '/reset-password', element: <ResetPasswordPage /> },
      { path: '/verify-email', element: <VerifyEmailPage /> },
    ],
  },
  {
    element: <RequireAuth allowUnonboarded />,
    children: [{ path: '/onboarding', element: <OnboardingPage /> }],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <DashboardPage /> },
          { path: '/transactions', element: <TransactionsPage /> },
          { path: '/transactions/new', element: <TransactionFormPage /> },
          { path: '/transactions/:id/edit', element: <TransactionFormPage /> },
          { path: '/analytics', element: <AnalyticsPage /> },
          { path: '/budgets', element: <BudgetsPage /> },
          { path: '/categories', element: <CategoriesPage /> },
          { path: '/recurring', element: <RecurringPage /> },
          { path: '/notifications', element: <NotificationsPage /> },
          { path: '/profile', element: <ProfilePage /> },
          { path: '/settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export default function App() {
  const status = useAuth((s) => s.status);

  useEffect(() => {
    applyTheme(useUi.getState().theme);
    void bootstrapSession();
  }, []);

  // The sync engine runs only while signed in.
  useEffect(() => {
    if (status !== 'authenticated') return;
    return startSyncEngine();
  }, [status]);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: idbPersister,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        buster: __APP_VERSION__,
        dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' },
      }}
    >
      <Suspense fallback={<Splash />}>
        <RouterProvider router={router} />
      </Suspense>
      <Toaster position="top-center" richColors closeButton toastOptions={{ className: 'font-sans' }} />
      <UpdatePrompt />
    </PersistQueryClientProvider>
  );
}
