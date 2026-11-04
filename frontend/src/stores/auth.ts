import { create } from 'zustand';
import type { UserDTO } from '@expenseflow/shared';

type Status = 'unknown' | 'authenticated' | 'anonymous';

const SNAPSHOT_KEY = 'ef:user';

function loadSnapshot(): UserDTO | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as UserDTO) : null;
  } catch {
    return null;
  }
}

interface AuthState {
  user: UserDTO | null;
  status: Status;
  /** true when we're showing a cached profile because the server is unreachable */
  offlineSession: boolean;
  setUser: (user: UserDTO, opts?: { offline?: boolean }) => void;
  clear: () => void;
  snapshot: () => UserDTO | null;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: 'unknown',
  offlineSession: false,
  setUser: (user, opts) => {
    try {
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(user));
    } catch {
      /* ignore */
    }
    set({ user, status: 'authenticated', offlineSession: !!opts?.offline });
  },
  clear: () => {
    try {
      localStorage.removeItem(SNAPSHOT_KEY);
    } catch {
      /* ignore */
    }
    set({ user: null, status: 'anonymous', offlineSession: false });
  },
  snapshot: loadSnapshot,
}));

export const useUser = () => useAuth((s) => s.user);
export const useCurrency = () => useAuth((s) => s.user?.preferredCurrency ?? 'INR');
