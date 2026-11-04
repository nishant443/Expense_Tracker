import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Theme } from '@expenseflow/shared';
import { localTodayISO } from '@expenseflow/shared';

interface UiState {
  theme: Theme;
  sidebarCollapsed: boolean;
  /** Month shown on the dashboard, YYYY-MM */
  month: string;
  installDismissedAt: number | null;
  setTheme: (t: Theme) => void;
  toggleSidebar: () => void;
  setMonth: (m: string) => void;
  dismissInstall: () => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      theme: (localStorage.getItem('ef:theme') as Theme | null) ?? 'system',
      sidebarCollapsed: false,
      month: localTodayISO().slice(0, 7),
      installDismissedAt: null,
      setTheme: (theme) => {
        localStorage.setItem('ef:theme', theme);
        applyTheme(theme);
        set({ theme });
      },
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMonth: (month) => set({ month }),
      dismissInstall: () => set({ installDismissedAt: Date.now() }),
    }),
    {
      name: 'ef:ui',
      // The selected month resets to "now" on every launch.
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, installDismissedAt: s.installDismissedAt, theme: s.theme }),
    },
  ),
);

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && !!media?.matches);
  document.documentElement.classList.toggle('dark', dark);
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((m) => m.setAttribute('content', dark ? '#0B0F19' : '#F7F8FA'));
}

media?.addEventListener('change', () => {
  if (useUi.getState().theme === 'system') applyTheme('system');
});
