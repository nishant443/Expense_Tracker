import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LogoMark } from '@/components/logo';
import { useAuth } from '@/stores/auth';

export function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <LogoMark className="h-14 w-14 animate-pulse" />
    </div>
  );
}

/** Protected routes: redirect to login, and to onboarding until it's completed. */
export function RequireAuth({ allowUnonboarded = false }: { allowUnonboarded?: boolean }) {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'unknown') return <Splash />;
  if (status === 'anonymous' || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (!allowUnonboarded && !user.onboarded) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

/** Public-only routes (login/register): bounce authenticated users into the app. */
export function GuestOnly() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'unknown') return <Splash />;
  if (status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />;
  }
  return <Outlet />;
}
