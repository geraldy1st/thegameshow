import { createStore, type StoreApi } from 'zustand/vanilla';
import type { FriendId, InvestmentId, QuestId } from '../data/balance';
import type { Clock } from '../core/clock';
import { buy as coreBuy, click as coreClick } from '../core/economy';
import { collectOffline as coreCollect, settle } from '../core/idle';
import { pull as corePull } from '../core/gacha';
import {
  answerQuiz as coreAnswerQuiz,
  claimQuest as coreClaim,
  markSceneSeen,
  rollDay,
  visitFriend,
} from '../core/quests';
import { createInitialState } from '../core/state';
import { rechargeEnergy } from '../core/energy';
import { t } from '../i18n/fr';
import type { GameState, LastPull } from '../core/types';
import { migrateToCurrent } from '../save/migrations';
import {
  RevisionConflictError,
  backupBeforeImport,
  loadSave,
  readRevision,
  writeSave,
  type SaveDb,
  backupBeforeReset,
  backupBeforeMigration,
  backupBeforeRestore,
  readRawSlot,
} from '../save/db';
import { parseImport, serializeExport } from '../save/exportImport';

export type Status = 'loading' | 'ready' | 'readonly' | 'recovery';

export interface GameStoreState {
  status: Status;
  game: GameState | null;
  /** Reason shown on the recovery screen. */
  recoveryReason: string | null;
  /** Lot 3: why the recovery screen is shown (future version has its own exact text). */
  recoveryKind: 'corrupt' | 'future' | null;
  /** Last message for the polite live region. */
  announcement: string;
  /** Credited absence shown on the welcome-back screen (not persisted). */
  absenceMs: number;
  /** Set when IndexedDB refused a write that was not a revision conflict. */
  writeError: boolean;
  init(): Promise<void>;
  tick(): void;
  click(): void;
  buy(id: InvestmentId): Promise<boolean>;
  collectOffline(): Promise<void>;
  exportSave(): string | null;
  importSave(text: string): Promise<{ ok: true } | { ok: false; reason: string }>;
  newGame(): Promise<void>;
  /** Raw stored save (even unreadable), for download before a reset. */
  rawCurrentSave(): Promise<string | null>;
  /** One draw, written and awaited BEFORE the caller starts the reveal (RES-2). */
  pull(): Promise<
    { ok: true; last: LastPull } | { ok: false; reason: 'no-ticket' | 'write-failed' }
  >;
  claimQuest(id: QuestId): Promise<boolean>;
  answerQuiz(choice: number): Promise<boolean>;
  visit(id: FriendId): Promise<{ counted: boolean } | null>;
  seeScene(id: FriendId, scene: number): Promise<void>;
  /** State of the `backup-before-reset` slot. */
  resetBackup(): Promise<
    { kind: 'none' } | { kind: 'unreadable' } | { kind: 'ok'; save: GameState }
  >;
  restoreResetBackup(): Promise<boolean>;
  /** Lot 3: state of the `backup-before-migration` slot. */
  migrationBackup(): Promise<
    { kind: 'none' } | { kind: 'unreadable' } | { kind: 'ok'; save: GameState }
  >;
  /** Lot 3: manual rollback to the pre-migration save (MVP v1.3 step 8, R12). */
  restoreMigrationBackup(): Promise<boolean>;
  flush(): Promise<boolean>;
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
    /**
     * Serialised write; resolves true when the current in-memory state is stored.
     * On a revision conflict this tab becomes read-only AND shows the stored state, so gains
     * or purchases that were never saved are not displayed (lot 1 PROGRESS note, DEF-GS-04).
     */
    const persistNow = (): Promise<boolean> => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      let ok = false;
      chain = chain.then(async () => {
        const { game, status } = get();
        if (!db || !game || status !== 'ready') return;
        try {
          const written = await writeSave(db, game, persistedRevision);
          persistedRevision = written.revision;
          const latest = get().game;
          if (latest) set({ game: { ...latest, revision: written.revision } });
          ok = true;
        } catch (e) {
          if (e instanceof RevisionConflictError) {
            const stored = await loadSave(db).catch(() => null);
            set({
              status: 'readonly',
              ...(stored?.kind === 'ok' ? { game: stored.save, absenceMs: 0 } : {}),
            });
          } else {
            set({ writeError: true });
          }
        }
      });
      return chain.then(() => ok);
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
      const now = deps.clock.now();
      const r = settle(rollDay(game, now), now);
      if (r.deferred) set({ absenceMs: get().absenceMs + r.creditedMs });
      set({ game: fn(rechargeEnergy(r.state, now)) });
      return true;
    };

    /**
     * Applies a change and awaits its write. If the write fails or loses to another tab, the
     * previous state is shown again and false is returned (never display an unsaved result).
     */
    const committed = async (fn: (g: GameState) => GameState): Promise<boolean> => {
      const before = get().game;
      let changed = false;
      const applied = update((g) => {
        const n = fn(g);
        changed = n !== g;
        return n;
      });
      if (!applied) return false;
      if (!changed) return true;
      const ok = await persistNow();
      if (!ok && get().status === 'ready') set({ game: before });
      return ok;
    };

    /** Reads a backup slot through the migration chain. */
    const readBackup = async (slot: 'backup-before-reset' | 'backup-before-migration') => {
      if (!db) return { kind: 'none' as const };
      const raw = await db.get('saves', slot);
      if (raw === undefined) return { kind: 'none' as const };
      const m = migrateToCurrent(raw);
      return m.ok ? { kind: 'ok' as const, save: m.value } : { kind: 'unreadable' as const };
    };
    /** Manual restore: the current record goes to `backup-before-restore` first (R12). */
    const restoreFrom = async (slot: 'backup-before-reset' | 'backup-before-migration') => {
      const b = await readBackup(slot);
      if (b.kind !== 'ok' || !db || get().status === 'readonly') return false;
      // Flush pending progress so the kept copy is the latest state the player saw.
      if (!(await persistNow())) return false;
      await backupBeforeRestore(db);
      persistedRevision = await storedRevision();
      const now = deps.clock.now();
      set({
        game: {
          ...b.save,
          maxSeenAt: Math.min(b.save.maxSeenAt, now),
          lastSeenAt: Math.min(b.save.lastSeenAt, now),
          energy: { ...b.save.energy, updatedAt: Math.min(b.save.energy.updatedAt, now) },
        },
        status: 'ready',
        recoveryReason: null,
        recoveryKind: null,
      });
      return persistNow();
    };

    return {
      status: 'loading',
      game: null,
      recoveryReason: null,
      recoveryKind: null,
      announcement: '',
      absenceMs: 0,
      writeError: false,

      async init() {
        const [opened, isWriter] = await Promise.all([deps.openDb(), deps.acquireWriterLock()]);
        db = opened;
        const loaded = await loadSave(db);
        if (loaded.kind === 'future') {
          // Refused without any write (MVP v1.3 step 7).
          set({
            status: 'recovery',
            recoveryKind: 'future',
            recoveryReason: `schemaVersion ${loaded.version}`,
          });
          return;
        }
        if (loaded.kind === 'corrupt') {
          set({ status: 'recovery', recoveryKind: 'corrupt', recoveryReason: loaded.reason });
          return;
        }
        // Only the writer tab keeps the raw pre-migration record (step 1 and 2); a read-only
        // tab migrates in memory for display and never writes.
        if (isWriter && loaded.kind === 'ok' && loaded.from === 'current')
          await backupBeforeMigration(db);
        const now = deps.clock.now();
        const base = loaded.kind === 'ok' ? loaded.save : createInitialState(now, deps.newSeed());
        persistedRevision = await storedRevision();
        const r = settle(base, now);
        set({
          game: r.state,
          status: isWriter ? 'ready' : 'readonly',
          absenceMs: r.deferred ? r.creditedMs : 0,
        });
        if (loaded.kind === 'ok' && loaded.from !== 'current')
          set({ announcement: t('restoredFromBackup') });
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
        return committed((g) => {
          const r = coreBuy(g, id);
          ok = r.ok;
          return r.ok ? r.state : g;
        }).then((stored) => ok && stored);
      },

      async pull() {
        let last: LastPull | null = null;
        const stored = await committed((g) => {
          const r = corePull(g);
          if (!r.ok) return g;
          last = r.last;
          return r.state;
        });
        if (!last) return { ok: false, reason: 'no-ticket' };
        if (!stored) return { ok: false, reason: 'write-failed' };
        return { ok: true, last };
      },

      async claimQuest(id) {
        let changed = false;
        const stored = await committed((g) => {
          const n = coreClaim(g, id);
          changed = n !== g;
          return n;
        });
        return changed && stored;
      },

      async answerQuiz(choice) {
        let changed = false;
        const stored = await committed((g) => {
          const n = coreAnswerQuiz(g, choice);
          changed = n !== g;
          return n;
        });
        return changed && stored;
      },

      async visit(id) {
        let counted = false;
        const stored = await committed((g) => {
          const r = visitFriend(g, id);
          counted = r.counted;
          return r.state;
        });
        return stored ? { counted } : null;
      },

      async seeScene(id, scene) {
        await committed((g) => markSceneSeen(g, id, scene));
      },

      resetBackup() {
        return readBackup('backup-before-reset');
      },

      restoreResetBackup() {
        return restoreFrom('backup-before-reset');
      },

      migrationBackup() {
        return readBackup('backup-before-migration');
      },

      restoreMigrationBackup() {
        return restoreFrom('backup-before-migration');
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
        set({ game: imported, status: 'ready', recoveryReason: null, recoveryKind: null });
        await persistNow();
        return { ok: true };
      },

      async newGame() {
        if (!db || get().status === 'readonly') return;
        await chain;
        persistedRevision = await storedRevision();
        await backupBeforeReset(db);
        set({
          game: createInitialState(deps.clock.now(), deps.newSeed()),
          status: 'ready',
          recoveryReason: null,
          recoveryKind: null,
        });
        await persistNow();
      },

      async rawCurrentSave() {
        if (!db) return null;
        return readRawSlot(db, 'current');
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
