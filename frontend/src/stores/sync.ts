import { create } from 'zustand';

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error';

interface SyncState {
  phase: SyncPhase;
  online: boolean;
  lastSyncedAt: number | null;
  lastError: string | null;
  set: (patch: Partial<Omit<SyncState, 'set'>>) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  phase: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'idle',
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  lastSyncedAt: null,
  lastError: null,
  set: (patch) => set(patch),
}));
