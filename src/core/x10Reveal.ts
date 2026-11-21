/**
 * Pure ×10 ceremony machine and schedule (0.6.1, step 1).
 * Oracle: SPEC v1.1 + MVP-TIRAGE-X10 v1.2 §1 bis. The proto is not an oracle.
 */
import type { Rarity } from '../data/balance';

export const X10_T = {
  arrive: 900,
  break: 320,
  fan: 900,
  grid: 320,
  flip: 320,
  stag: 90,
  pause3: 180,
  flash: 180,
  recap: 180,
  fade: 120,
} as const;

/** arrive + break + fan + grid (sealed wait excluded). */
export const X10_PRE_FLIP = X10_T.arrive + X10_T.break + X10_T.fan + X10_T.grid; /* 2440 */

export type X10Phase =
  'arrive' | 'sealed' | 'break' | 'fan' | 'grid' | 'flip' | 'flash' | 'recap' | 'closed';

export type X10Event =
  | 'OPEN'
  | 'ARRIVE_DONE'
  | 'BREAK_REQUEST'
  | 'BREAK_DONE'
  | 'FAN_DONE'
  | 'GRID_DONE'
  | 'FLIP_DONE'
  | 'FLASH_DONE'
  | 'RECAP_FOCUS'
  | 'SKIP'
  | 'CLOSE'
  | 'UNMOUNT'
  | 'OPEN_SHEET'
  | 'HIDE';

export type X10OpenFlags = { reduced?: boolean; resumed?: boolean; threeStarCount?: number };

/** Best base rarity of an already-committed batch. */
export function bestRarity(rarities: readonly Rarity[]): Rarity {
  if (rarities.length === 0) return 1;
  return rarities.reduce<Rarity>((b, r) => (r > b ? r : b), 1);
}

export function threeStarCount(rarities: readonly Rarity[]): number {
  return rarities.filter((r) => r === 3).length;
}

/**
 * Flip order: non-3★ first (original index kept), then 3★.
 * Empty or short batches keep their relative order under the same rule.
 */
export function flipOrder(rarities: readonly Rarity[]): number[] {
  const low: number[] = [];
  const high: number[] = [];
  rarities.forEach((r, i) => (r === 3 ? high : low).push(i));
  return [...low, ...high];
}

export function tUp(orderIndex: number, threeStars: number): number {
  const pause = threeStars >= 1 && orderIndex >= 10 - threeStars ? X10_T.pause3 : 0;
  return X10_PRE_FLIP + orderIndex * X10_T.stag + pause;
}

export type X10Schedule = {
  threeStarCount: number;
  reduced: boolean;
  resumed: boolean;
  /** Instant the last 3★ flash starts, or null. */
  flashStartAt: number | null;
  flashEndAt: number | null;
  recapVisibleAt: number;
  focusAt: number;
  /** is-up instant for each flip-order index (0..n-1). Empty when reduced/resumed. */
  tUpByOrder: readonly number[];
};

/**
 * Absolute instants from t = 0 at the start of `arrive`, sealed wait excluded
 * (auto-break at the end of arrive). Times in ms, exact (0 ms tolerance).
 */
export function x10Schedule(opts: {
  threeStarCount: number;
  reduced?: boolean;
  resumed?: boolean;
  cardCount?: number;
}): X10Schedule {
  const n = opts.cardCount ?? 10;
  const k = opts.threeStarCount;
  if (opts.resumed) {
    return {
      threeStarCount: k,
      reduced: false,
      resumed: true,
      flashStartAt: null,
      flashEndAt: null,
      recapVisibleAt: 0,
      focusAt: 0,
      tUpByOrder: [],
    };
  }
  if (opts.reduced) {
    return {
      threeStarCount: k,
      reduced: true,
      resumed: false,
      flashStartAt: null,
      flashEndAt: null,
      recapVisibleAt: X10_T.fade,
      focusAt: X10_T.fade,
      tUpByOrder: [],
    };
  }
  const tUpByOrder = Array.from({ length: n }, (_, i) => tUp(i, k));
  const lastUp = tUpByOrder[n - 1] ?? X10_PRE_FLIP;
  if (k < 1) {
    const recapVisibleAt = lastUp + X10_T.flip;
    return {
      threeStarCount: 0,
      reduced: false,
      resumed: false,
      flashStartAt: null,
      flashEndAt: null,
      recapVisibleAt,
      focusAt: recapVisibleAt + X10_T.recap,
      tUpByOrder,
    };
  }
  const flashStartAt = lastUp + X10_T.flip;
  const flashEndAt = flashStartAt + X10_T.flash;
  return {
    threeStarCount: k,
    reduced: false,
    resumed: false,
    flashStartAt,
    flashEndAt,
    recapVisibleAt: flashEndAt,
    focusAt: flashEndAt + X10_T.recap,
    tUpByOrder,
  };
}

export function reduceX10Phase(
  phase: X10Phase,
  event: X10Event,
  flags: X10OpenFlags = {},
): X10Phase {
  if (event === 'UNMOUNT') return 'closed';
  if (event === 'OPEN') {
    // DEF-GS-67: OPEN is accepted only from `closed`.
    if (phase !== 'closed') return phase;
    if (flags.resumed) return 'recap';
    return 'arrive';
  }
  if (event === 'SKIP' || event === 'OPEN_SHEET' || event === 'HIDE') {
    if (phase === 'closed') return 'closed';
    return 'recap';
  }
  if (event === 'CLOSE') return phase === 'recap' ? 'closed' : phase;

  switch (event) {
    case 'ARRIVE_DONE':
      return phase === 'arrive' ? (flags.reduced ? 'recap' : 'sealed') : phase;
    case 'BREAK_REQUEST':
      return phase === 'sealed' ? 'break' : phase;
    case 'BREAK_DONE':
      return phase === 'break' ? 'fan' : phase;
    case 'FAN_DONE':
      return phase === 'fan' ? 'grid' : phase;
    case 'GRID_DONE':
      return phase === 'grid' ? 'flip' : phase;
    case 'FLIP_DONE':
      if (phase !== 'flip') return phase;
      if (flags.reduced || (flags.threeStarCount ?? 0) < 1) return 'recap';
      return 'flash';
    case 'FLASH_DONE':
      return phase === 'flash' ? 'recap' : phase;
    case 'RECAP_FOCUS':
      return phase;
    default:
      return phase;
  }
}

export type X10Clock = {
  setTimeout: (handler: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
};

export type X10Runtime = {
  phase: () => X10Phase;
  /** Card original index currently flashing, or null. */
  flashing: () => number | null;
  /** Original indices already face-up. */
  faceUp: () => readonly number[];
  pendingTimeouts: () => number;
  skip: () => void;
  breakSeal: () => void;
  close: () => void;
  unmount: () => void;
  openSheet: () => void;
  hide: () => void;
};

const defaultClock = (): X10Clock => ({
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (id) => clearTimeout(id),
});

/**
 * Drives the schedule with an injectable clock. Every phase change goes
 * through `reduceX10Phase`. `autoBreak` defaults to false so production
 * cannot break the seal by omission (DEF-GS-67, O-1, O-2).
 */
export function createX10Runtime(
  rarities: readonly Rarity[],
  flags: X10OpenFlags & { autoBreak?: boolean } = {},
  clock: X10Clock = defaultClock(),
): X10Runtime {
  const k = threeStarCount(rarities);
  const order = flipOrder(rarities);
  const sched = x10Schedule({
    threeStarCount: k,
    reduced: flags.reduced,
    resumed: flags.resumed,
  });
  const reduceFlags: X10OpenFlags = {
    reduced: flags.reduced,
    resumed: flags.resumed,
    threeStarCount: k,
  };
  let phase: X10Phase = reduceX10Phase('closed', 'OPEN', reduceFlags);
  const face = new Set<number>();
  let flashing: number | null = null;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const later = (ms: number, fn: () => void) => {
    const id = clock.setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  };
  const clearAll = () => {
    for (const id of timers) clock.clearTimeout(id);
    timers.clear();
  };
  const apply = (event: X10Event): X10Phase => {
    phase = reduceX10Phase(phase, event, reduceFlags);
    return phase;
  };
  const revealAll = () => {
    for (let i = 0; i < rarities.length; i++) face.add(i);
  };
  const enterRecapVia = (event: X10Event): void => {
    const next = reduceX10Phase(phase, event, reduceFlags);
    if (next === 'recap' && phase !== 'recap') {
      clearAll();
      flashing = null;
      revealAll();
    }
    if (next === 'closed' && phase !== 'closed') {
      clearAll();
      flashing = null;
    }
    phase = next;
  };

  const startFlips = () => {
    // Caller has just applied GRID_DONE; phase is `flip`.
    for (let i = 0; i < order.length; i++) {
      const card = order[i]!;
      later(sched.tUpByOrder[i]! - X10_PRE_FLIP, () => {
        if (phase !== 'flip' && phase !== 'flash') return;
        face.add(card);
      });
    }
    if (sched.flashStartAt != null) {
      const lastCard = order[order.length - 1]!;
      later(sched.flashStartAt - X10_PRE_FLIP, () => {
        if (apply('FLIP_DONE') !== 'flash') return;
        flashing = lastCard;
      });
      later(sched.flashEndAt! - X10_PRE_FLIP, () => {
        enterRecapVia('FLASH_DONE');
      });
    } else {
      later(sched.recapVisibleAt - X10_PRE_FLIP, () => {
        enterRecapVia('FLIP_DONE');
      });
    }
  };

  const startBreak = () => {
    if (apply('BREAK_REQUEST') !== 'break') return;
    later(X10_T.break, () => {
      if (apply('BREAK_DONE') !== 'fan') return;
      later(X10_T.fan, () => {
        if (apply('FAN_DONE') !== 'grid') return;
        later(X10_T.grid, () => {
          if (apply('GRID_DONE') !== 'flip') return;
          startFlips();
        });
      });
    });
  };

  if (flags.resumed) {
    clearAll();
    flashing = null;
    revealAll();
  } else if (flags.reduced) {
    revealAll();
    later(X10_T.fade, () => {
      enterRecapVia('ARRIVE_DONE');
    });
  } else {
    later(X10_T.arrive, () => {
      apply('ARRIVE_DONE');
      if (phase === 'recap') {
        clearAll();
        flashing = null;
        revealAll();
        return;
      }
      if (flags.autoBreak === true && phase === 'sealed') startBreak();
    });
  }

  return {
    phase: () => phase,
    flashing: () => flashing,
    faceUp: () => [...face],
    pendingTimeouts: () => timers.size,
    skip: () => {
      enterRecapVia('SKIP');
    },
    breakSeal: () => {
      startBreak();
    },
    close: () => {
      enterRecapVia('CLOSE');
    },
    unmount: () => {
      enterRecapVia('UNMOUNT');
    },
    openSheet: () => {
      enterRecapVia('OPEN_SHEET');
    },
    hide: () => {
      enterRecapVia('HIDE');
    },
  };
}
