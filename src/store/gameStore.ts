import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AssociateId, FriendId, InvestmentId, QuestId } from '../data/balance';
import type { Clock } from '../core/clock';
import { buy as coreBuy } from '../core/economy';
import { convert as coreConvert } from '../core/conversion';
import { normalizeWorkMode, tap as coreTap } from '../core/work';
import type { TapWindow } from '../core/tapLimiter';
import { collectOffline as coreCollect, settle } from '../core/idle';
import { pull as corePull, pullMany as corePullMany } from '../core/gacha';
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
  FutureSchemaWriteError,
  RevisionConflictError,
  backupBeforeImport,
  loadSave,
  readRevision,
  writeSave,
  type SaveDb,
  backupBeforeReset,
  backupBeforeMigration,
  backupBeforeRestore,
  migrateCurrentSameTx,
  readRawSlot,
} from '../save/db';
import { activateAppelOnState, clampAppelForImport, makeActivationId } from '../core/appel';
import { parseImport, serializeExport } from '../save/exportImport';

export type Status = 'loading' | 'ready' | 'readonly' | 'recovery';

export type TapOutcome =
  | { accepted: true; gained: number; levelUp: boolean; milestone: boolean }
  | { accepted: false; reason: 'rate' | 'energy' | 'readonly' };

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
  /**
   * Real wall clock sample for UI (DEF-GS-29). Updated on init/tick so render stays pure.
   * Clamped with `displayWallNow(maxSeenAt, wallMs)` at the call site.
   */
  wallMs: number;
  /** DEF-GS / R-MV5-01: another tab upgraded IndexedDB or a future write was refused — reload. */
  reloadNeeded: boolean;
  init(): Promise<void>;
  /** Game clock (injectable; the harness clock in test builds). */
  now(): number;
  tick(): void;
  /**
   * Lot 4: one tap on the Travailler document at the game clock. `mult` is the boost multiplier
   * decided by the caller from `isDoubled(now)` (points only). Only accepted taps count
   * (totalClicks, « clic » quest). A read-only tab counts nothing.
   */
  tap(mult?: number): TapOutcome;
  /** Converts the points (100 pts = 10 ¥, +1 Créativité); resolves the yen credited (0: none). */
  convertPoints(): Promise<number>;
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
  /**
   * Patch 0.4.3 (P10): ten draws in ONE committed write (one IndexedDB put); on a failed write
   * nothing is drawn (state restored).
   */
  pullTen(): Promise<
    { ok: true; results: LastPull[] } | { ok: false; reason: 'no-ticket' | 'write-failed' }
  >;
  /** Associés v11: atomic idempotent call activation (R-AS-03). */
  startAppel(
    id: AssociateId,
    activationId?: string,
  ): Promise<
    | { ok: true; replay: boolean }
    | { ok: false; reason: 'locked' | 'busy' | 'bad-clock' | 'write-failed' | 'readonly' }
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
  /**
   * Pre-migration copy to offer (lot 4, §4.3): the most recent present slot, `-v3` first,
   * otherwise `backup-before-migration`.
   */
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

/** Delays (ms) between writer lock attempts: a tab closed a moment ago may still hold it (DEF-GS-13). */
export const WRITER_LOCK_RETRY_MS: readonly number[] = [50, 100, 200, 400, 800];

type LockManagerLike = Pick<LockManager, 'request'>;

function tryWriterLock(locks: LockManagerLike): Promise<boolean> {
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

/**
 * Holds the writer lock for the lifetime of the page when Web Locks exist (RES-3).
 * WebKit may release the lock of a just-closed tab late (DEF-GS-13): retry with a short,
 * bounded backoff (about 1.5 s in total) before falling back to read-only.
 */
export async function webLocksWriter(
  locks: LockManagerLike | undefined = typeof navigator !== 'undefined'
    ? navigator.locks
    : undefined,
  retryMs: readonly number[] = WRITER_LOCK_RETRY_MS,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<boolean> {
  if (!locks) return true; // fallback: revision compare-and-set only
  if (await tryWriterLock(locks)) return true;
  for (const ms of retryMs) {
    await sleep(ms);
    if (await tryWriterLock(locks)) return true;
  }
  return false;
}

/** Gap between clearing and rewriting a repeated announcement (DEF-GS-16). */
export const ANNOUNCE_REPEAT_GAP_MS = 100;

export const randomSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;

export function createGameStore(deps: GameStoreDeps): StoreApi<GameStoreState> {
  const debounceMs = deps.debounceMs ?? 2000;
  let db: SaveDb | null = null;
  let persistedRevision = -1;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  /** Sliding-window tap limiter (memory only, §4.2). */
  let tapWindow: TapWindow = [];
  let announceTimer: ReturnType<typeof setTimeout> | null = null;

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
          } else if (e instanceof FutureSchemaWriteError) {
            // R-MV5-01: do not clobber a newer save; become readonly and surface the FR message.
            set({
              status: 'readonly',
              writeError: true,
              recoveryKind: 'future',
              recoveryReason: `schemaVersion ${e.storedVersion}`,
              reloadNeeded: true,
            });
            get().announce(t('reloadNeeded'));
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
    type BackupSlot =
      'backup-before-reset' | 'backup-before-migration' | 'backup-before-migration-v3';
    const readBackup = async (slot: BackupSlot) => {
      if (!db) return { kind: 'none' as const };
      const raw = await db.get('saves', slot);
      if (raw === undefined) return { kind: 'none' as const };
      const m = migrateToCurrent(raw);
      return m.ok ? { kind: 'ok' as const, save: m.value } : { kind: 'unreadable' as const };
    };
    /** Manual restore: the current record goes to `backup-before-restore` first (R12). */
    /** `-v3` first when present, otherwise the lot 3 slot (§4.3, previous version first). */
    const migrationSlot = async (): Promise<BackupSlot> =>
      db && (await db.get('saves', 'backup-before-migration-v3')) !== undefined
        ? 'backup-before-migration-v3'
        : 'backup-before-migration';
    const restoreFrom = async (slot: BackupSlot) => {
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
      wallMs: typeof Date !== 'undefined' ? Date.now() : 0,
      reloadNeeded: false,

      async init() {
        const [opened, isWriter] = await Promise.all([deps.openDb(), deps.acquireWriterLock()]);
        db = opened;
        // Reload prompt when another tab upgrades IndexedDB (R-MV5-01 residual).
        opened.addEventListener('versionchange', () => {
          set({ reloadNeeded: true, status: 'readonly' });
          get().announce(t('reloadNeeded'));
        });
        set({ wallMs: typeof Date !== 'undefined' ? Date.now() : 0 });
        const loaded = await loadSave(db);
        if (loaded.kind === 'future') {
          // Refused without any write (MVP v1.3 step 7).
          set({
            status: 'recovery',
            recoveryKind: 'future',
            recoveryReason: `schemaVersion ${loaded.version}`,
            reloadNeeded: true,
          });
          get().announce(t('reloadNeeded'));
          return;
        }
        if (loaded.kind === 'corrupt') {
          set({ status: 'recovery', recoveryKind: 'corrupt', recoveryReason: loaded.reason });
          return;
        }
        // R-MV5-02: writer migrates v4→v5 (backup + current) in ONE transaction.
        // Read-only tabs migrate in memory only and never write.
        let loadedOk = loaded;
        if (isWriter && loaded.kind === 'ok' && loaded.from === 'current') {
          const migrated = await migrateCurrentSameTx(db);
          if (migrated) {
            loadedOk = { kind: 'ok', save: migrated, from: 'current' };
          } else {
            // Fallback for older slots: legacy backup helper then in-memory migrate path.
            await backupBeforeMigration(db);
          }
        }
        const now = deps.clock.now();
        const base =
          loadedOk.kind === 'ok' ? loadedOk.save : createInitialState(now, deps.newSeed());
        persistedRevision = await storedRevision();
        const r = settle(base, now);
        set({
          game: r.state,
          status: isWriter ? 'ready' : 'readonly',
          absenceMs: r.deferred ? r.creditedMs : 0,
        });
        if (loadedOk.kind === 'ok' && loadedOk.from !== 'current')
          set({ announcement: t('restoredFromBackup') });
        if (isWriter) {
          await persistNow();
        }
      },

      now() {
        return deps.clock.now();
      },

      tick() {
        set({ wallMs: typeof Date !== 'undefined' ? Date.now() : get().wallMs });
        if (update((g) => g)) persistLater();
      },

      tap(mult = 1) {
        let out: TapOutcome = { accepted: false, reason: 'readonly' };
        const ok = update((g) => {
          const r = coreTap(g, tapWindow, deps.clock.now(), mult);
          tapWindow = r.window;
          out = r.accepted
            ? { accepted: true, gained: r.gained, levelUp: r.levelUp, milestone: r.milestone }
            : { accepted: false, reason: r.reason };
          return r.state;
        });
        if (ok && out.accepted) persistLater();
        return out;
      },

      async convertPoints() {
        let yen = 0;
        const stored = await committed((g) => {
          const r = coreConvert(g);
          yen = r.yen;
          return r.state;
        });
        return stored ? yen : 0;
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

      async pullTen() {
        let results: LastPull[] | null = null;
        const stored = await committed((g) => {
          const r = corePullMany(g, 10);
          if (!r.ok) return g;
          results = r.results;
          return r.state;
        });
        if (!results) return { ok: false, reason: 'no-ticket' };
        if (!stored) return { ok: false, reason: 'write-failed' };
        return { ok: true, results };
      },

      async startAppel(id, activationId) {
        if (get().status !== 'ready') return { ok: false, reason: 'readonly' };
        const aid = activationId ?? makeActivationId();
        let replay = false;
        let fail: 'locked' | 'busy' | 'bad-clock' | null = null;
        const stored = await committed((g) => {
          const now = deps.clock.now();
          // Wall clock: Date.now() when available so a game-clock jump cannot shorten cool.
          const wallNow = typeof Date !== 'undefined' ? Date.now() : now;
          const r = activateAppelOnState(g, id, now, wallNow, aid);
          if (!r.ok) {
            fail = r.reason;
            return g;
          }
          replay = r.replay;
          return r.state;
        });
        if (fail) return { ok: false, reason: fail };
        if (!stored) return { ok: false, reason: 'write-failed' };
        if (!replay)
          get().announce(t('appelStarted', { name: id.charAt(0).toUpperCase() + id.slice(1) }));
        return { ok: true, replay };
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

      async migrationBackup() {
        return readBackup(await migrationSlot());
      },

      async restoreMigrationBackup() {
        return restoreFrom(await migrationSlot());
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
        // Patch 0.4.2 (R-P42-4): a 0.4.1 export in `presse` comes back as `roman`, written once.
        const value = normalizeWorkMode(parsed.value);
        const maxSeen = Math.min(value.maxSeenAt, now);
        const imported: GameState = {
          ...value,
          maxSeenAt: maxSeen,
          lastSeenAt: Math.min(value.lastSeenAt, now),
          // R-MV5-04 / DEF-GS-31: clamp calls to local maxSeenAt and real wall time.
          appel: clampAppelForImport(
            value.appel,
            maxSeen,
            typeof Date !== 'undefined' ? Date.now() : maxSeen,
          ),
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
        // DEF-GS-16: a live region only speaks when its DOM really changes. Repeating the same
        // text (e.g. « Plus d'énergie » every 5 s) is done as empty -> text on the next task, so
        // every occurrence is a real mutation and is read again.
        if (announceTimer) clearTimeout(announceTimer);
        announceTimer = null;
        if (message !== '' && get().announcement === message) {
          set({ announcement: '' });
          announceTimer = setTimeout(() => {
            announceTimer = null;
            set({ announcement: message });
          }, ANNOUNCE_REPEAT_GAP_MS);
          return;
        }
        set({ announcement: message });
      },
    };
  });
}
