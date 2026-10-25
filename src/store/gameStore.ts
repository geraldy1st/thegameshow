import { createStore, type StoreApi } from 'zustand/vanilla';
import type { InvestmentId } from '../data/balance';
import type { Clock } from '../core/clock';
import { buy as coreBuy, click as coreClick } from '../core/economy';
import { collectOffline as coreCollect, settle } from '../core/idle';
import { createInitialState } from '../core/state';
import type { GameState } from '../core/types';
import {
  RevisionConflictError,
  backupBeforeImport,
  loadSave,
  readRevision,
  writeSave,
  type SaveDb,
} from '../save/db';
import { parseImport, serializeExport } from '../save/exportImport';

export type Status = 'loading' | 'ready' | 'readonly' | 'recovery';

export interface GameStoreState {
  status: Status;
  game: GameState | null;
  /** Reason shown on the recovery screen. */
  recoveryReason: string | null;
  /** Last message for the polite live region. */
  announcement: string;
  /** Credited absence shown on the welcome-back screen (not persisted). */
  absenceMs: number;
  init(): Promise<void>;
  tick(): void;
  click(): void;
  buy(id: InvestmentId): Promise<boolean>;
  collectOffline(): Promise<void>;
  exportSave(): string | null;
  importSave(text: string): Promise<{ ok: true } | { ok: false; reason: string }>;
  newGame(): Promise<void>;
  flush(): Promise<void>;
  announce(message: string): void;
}

export interface GameStoreDeps {
  clock: Clock;
  openDb: () => Promise<SaveDb>;
  newSeed: () => number;
  /** Web Locks acquisition; resolves false if another tab owns the writer lock. */
  acquireWriterLock: () => Promise<boolean>;
  debounceMs?: number;
}

/** Holds the writer lock for the lifetime of the page when Web Locks exist (RES-3). */
export function webLocksWriter(): Promise<boolean> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return Promise.resolve(true); // fallback: revision compare-and-set only
  return new Promise((resolve) => {
    void locks.request('thegameshow-writer', { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve(false);
        return undefined;
      }
      resolve(true);
      return new Promise<void>(() => undefined); // never released while the page lives
    });
  });
}

export const randomSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;

export function createGameStore(deps: GameStoreDeps): StoreApi<GameStoreState> {
  const debounceMs = deps.debounceMs ?? 2000;
  let db: SaveDb | null = null;
  let persistedRevision = -1;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();

  return createStore<GameStoreState>()((set, get) => {
    /** Serialised write; on conflict this tab becomes read-only. */
    const persistNow = (): Promise<void> => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      chain = chain.then(async () => {
        const { game, status } = get();
        if (!db || !game || status !== 'ready') return;
        try {
          const written = await writeSave(db, game, persistedRevision);
          persistedRevision = written.revision;
          const latest = get().game;
          if (latest) set({ game: { ...latest, revision: written.revision } });
        } catch (e) {
          if (e instanceof RevisionConflictError) set({ status: 'readonly' });
          else throw e;
        }
      });
      return chain;
    };
    /** Revision currently stored in the `current` slot (-1 if none or unreadable). */
    const storedRevision = async (): Promise<number> => (db ? readRevision(db) : -1);
    const persistLater = () => {
      if (timer) return;
      timer = setTimeout(() => void persistNow(), debounceMs);
    };
    const update = (fn: (g: GameState) => GameState) => {
      const { game, status } = get();
      if (!game || status !== 'ready') return false;
      const r = settle(game, deps.clock.now());
      if (r.deferred) set({ absenceMs: get().absenceMs + r.creditedMs });
      set({ game: fn(r.state) });
      return true;
    };

    return {
      status: 'loading',
      game: null,
      recoveryReason: null,
      announcement: '',
      absenceMs: 0,

      async init() {
        const [opened, isWriter] = await Promise.all([deps.openDb(), deps.acquireWriterLock()]);
        db = opened;
        const loaded = await loadSave(db);
        if (loaded.kind === 'corrupt') {
          set({ status: 'recovery', recoveryReason: loaded.reason });
          return;
        }
        const now = deps.clock.now();
        const base = loaded.kind === 'ok' ? loaded.save : createInitialState(now, deps.newSeed());
        persistedRevision = await storedRevision();
        const r = settle(base, now);
        set({
          game: r.state,
          status: isWriter ? 'ready' : 'readonly',
          absenceMs: r.deferred ? r.creditedMs : 0,
        });
        if (isWriter) {
          await persistNow();
        }
      },

      tick() {
        if (update((g) => g)) persistLater();
      },

      click() {
        if (update(coreClick)) persistLater();
      },

      async buy(id) {
        let ok = false;
        update((g) => {
          const r = coreBuy(g, id);
          ok = r.ok;
          return r.ok ? r.state : g;
        });
        if (ok) await persistNow();
        return ok;
      },

      async collectOffline() {
        if (update(coreCollect)) {
          set({ absenceMs: 0 });
          await persistNow();
        }
      },

      exportSave() {
        const { game } = get();
        if (!game) return null;
        const exportedAt = deps.clock.now();
        const next = { ...game, backup: { ...game.backup, lastExportAt: exportedAt } };
        if (get().status === 'ready') {
          set({ game: next });
          void persistNow();
        }
        return serializeExport(next);
      },

      async importSave(text) {
        const parsed = parseImport(text);
        if (!parsed.ok) return parsed;
        if (!db) return { ok: false, reason: 'storage unavailable' };
        const { status } = get();
        if (status === 'readonly') return { ok: false, reason: 'read-only tab' };
        await chain;
        await backupBeforeImport(db);
        persistedRevision = await storedRevision();
        const now = deps.clock.now();
        // An imported save may come from another device clock: never let it block settlement.
        const imported: GameState = {
          ...parsed.value,
          maxSeenAt: Math.min(parsed.value.maxSeenAt, now),
          lastSeenAt: Math.min(parsed.value.lastSeenAt, now),
        };
        set({ game: imported, status: 'ready', recoveryReason: null });
        await persistNow();
        return { ok: true };
      },

      async newGame() {
        if (!db || get().status === 'readonly') return;
        await chain;
        persistedRevision = await storedRevision();
        set({
          game: createInitialState(deps.clock.now(), deps.newSeed()),
          status: 'ready',
          recoveryReason: null,
        });
        await persistNow();
      },

      flush() {
        return persistNow();
      },

      announce(message) {
        set({ announcement: message });
      },
    };
  });
}
