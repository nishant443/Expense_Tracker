import type { AuthResponse, LoginInput, RegisterInput, UserDTO } from '@expenseflow/shared';
import { api, ApiError, isNetworkError, setCsrfToken, setSessionExpiredHandler } from '@/lib/api';
import { bindLocalDataToUser, clearLocalData } from '@/lib/db';
import { queryClient } from '@/lib/query-client';
import { requestSync } from '@/services/sync-engine';
import { useAuth } from '@/stores/auth';
import { applyTheme, useUi } from '@/stores/ui';

function adopt(user: UserDTO, offline = false) {
  useAuth.getState().setUser(user, { offline });
  queryClient.setQueryData(['me'], user);
  // Server preference wins when it differs from the local one.
  if (user.theme !== useUi.getState().theme) useUi.getState().setTheme(user.theme);
  else applyTheme(user.theme);
}

/** Called once at startup: restores the session, or a cached profile when offline. */
export async function bootstrapSession(): Promise<void> {
  setSessionExpiredHandler(() => {
    if (useAuth.getState().status === 'authenticated') useAuth.getState().clear();
  });
  try {
    const { user } = await api.get<{ user: UserDTO }>('/users/me');
    await bindLocalDataToUser(user.id);
    adopt(user);
    // Keep the device's timezone in sync so server-side "today" matches the user.
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz !== user.timezone) void api.patch<{ user: UserDTO }>('/users/me', { timezone: tz }).then((r) => adopt(r.user)).catch(() => {});
  } catch (e) {
    if (isNetworkError(e)) {
      const cached = useAuth.getState().snapshot();
      if (cached) return adopt(cached, true);
    }
    useAuth.getState().clear();
  }
}

export async function login(input: LoginInput): Promise<UserDTO> {
  const res = await api.post<AuthResponse>('/auth/login', input);
  setCsrfToken(res.csrfToken);
  await bindLocalDataToUser(res.user.id);
  adopt(res.user);
  requestSync();
  return res.user;
}

export async function register(input: RegisterInput): Promise<UserDTO> {
  const res = await api.post<AuthResponse>('/auth/register', input);
  setCsrfToken(res.csrfToken);
  await bindLocalDataToUser(res.user.id);
  adopt(res.user);
  // Pre-fill timezone so recurring/budget "today" is local to the user.
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz) void api.patch('/users/me', { timezone: tz }).catch(() => {});
  requestSync();
  return res.user;
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } catch (e) {
    if (!(e instanceof ApiError) && !isNetworkError(e)) throw e;
  }
  await clearLocalData();
  queryClient.clear();
  useAuth.getState().clear();
}

export function updateCachedUser(user: UserDTO) {
  adopt(user);
}
