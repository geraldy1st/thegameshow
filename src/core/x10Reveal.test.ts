import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Rarity } from '../data/balance';
import {
  X10_PRE_FLIP,
  X10_T,
  bestRarity,
  createX10Runtime,
  flipOrder,
  reduceX10Phase,
  tUp,
  threeStarCount,
  x10Schedule,
  type X10Event,
  type X10Phase,
} from './x10Reveal';

const ten = (pattern: string): Rarity[] => pattern.split('').map((c) => Number(c) as Rarity);

/** k 3★ at the end of the natural order; the rest 1★. */
const withK = (k: number): Rarity[] =>
  Array.from({ length: 10 }, (_, i) => (i >= 10 - k ? 3 : 1) as Rarity);

describe('bestRarity / flipOrder', () => {
  it('TC-PRE: best rarity is the max already-committed base rarity', () => {
    expect(bestRarity(ten('1111111111'))).toBe(1);
    expect(bestRarity(ten('1112111111'))).toBe(2);
    expect(bestRarity(ten('1212131111'))).toBe(3);
    expect(bestRarity([])).toBe(1);
  });

  it('M-ORD / TC-TIM-03: 3★ are last in flipOrder, original index kept', () => {
    const r = ten('3131211112');
    expect(flipOrder(r)).toEqual([1, 3, 4, 5, 6, 7, 8, 9, 0, 2]);
    expect(flipOrder(r).map((i) => r[i])).toEqual([1, 1, 2, 1, 1, 1, 1, 2, 3, 3]);
  });
});

describe('x10Schedule (R-X10-13, tolerance 0 ms)', () => {
  it('constants match SPEC v1.1', () => {
    expect(X10_T).toEqual({
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
    });
    expect(X10_PRE_FLIP).toBe(2440);
  });

  it('TC-TIM-01: 0 × 3★ — no pause3, no flash, focus at 3750', () => {
    const s = x10Schedule({ threeStarCount: 0 });
    expect(s.flashStartAt).toBeNull();
    expect(s.flashEndAt).toBeNull();
    expect(s.tUpByOrder[9]).toBe(3250);
    expect(s.recapVisibleAt).toBe(3570);
    expect(s.focusAt).toBe(3750);
    expect(tUp(9, 0)).toBe(3250);
  });

  it('TC-TIM-02: 1 × 3★ — pause, flip, then flash chained on the last card', () => {
    const s = x10Schedule({ threeStarCount: 1 });
    expect(s.tUpByOrder[9]).toBe(3430);
    expect(s.flashStartAt).toBe(3750);
    expect(s.flashEndAt).toBe(3930);
    expect(s.recapVisibleAt).toBe(3930);
    expect(s.focusAt).toBe(4110);
    // Flash starts after this card's flip, not at is-up.
    expect(s.flashStartAt).toBe(s.tUpByOrder[9]! + X10_T.flip);
  });

  it('TC-TIM-03: k ∈ {2,10} — one flash, same instant, on flip-order 9', () => {
    const a = x10Schedule({ threeStarCount: 2 });
    const b = x10Schedule({ threeStarCount: 10 });
    expect(a.flashStartAt).toBe(3750);
    expect(b.flashStartAt).toBe(3750);
    expect(a.focusAt).toBe(4110);
    expect(b.focusAt).toBe(4110);
    expect(a.focusAt).toBeLessThan(4500);
  });

  it('TC-TIM-04: totals are exact (0 ms)', () => {
    expect(x10Schedule({ threeStarCount: 0 }).focusAt).toBe(3750);
    expect(x10Schedule({ threeStarCount: 1 }).focusAt).toBe(4110);
    expect(x10Schedule({ threeStarCount: 10 }).focusAt).toBe(4110);
  });

  it('reduced motion: recap and focus at 120 ms, no flash', () => {
    const s = x10Schedule({ threeStarCount: 10, reduced: true });
    expect(s.flashStartAt).toBeNull();
    expect(s.recapVisibleAt).toBe(120);
    expect(s.focusAt).toBe(120);
  });

  it('resume: recap at 0 ms, no flash', () => {
    const s = x10Schedule({ threeStarCount: 3, resumed: true });
    expect(s.flashStartAt).toBeNull();
    expect(s.recapVisibleAt).toBe(0);
    expect(s.focusAt).toBe(0);
  });
});

describe('reduceX10Phase (TC-MAE)', () => {
  const phases: X10Phase[] = [
    'arrive',
    'sealed',
    'break',
    'fan',
    'grid',
    'flip',
    'flash',
    'recap',
    'closed',
  ];

  it('TC-MAE-01: the valid happy path', () => {
    let p: X10Phase = reduceX10Phase('closed', 'OPEN');
    expect(p).toBe('arrive');
    p = reduceX10Phase(p, 'ARRIVE_DONE');
    expect(p).toBe('sealed');
    p = reduceX10Phase(p, 'BREAK_REQUEST');
    expect(p).toBe('break');
    p = reduceX10Phase(p, 'BREAK_DONE');
    expect(p).toBe('fan');
    p = reduceX10Phase(p, 'FAN_DONE');
    expect(p).toBe('grid');
    p = reduceX10Phase(p, 'GRID_DONE');
    expect(p).toBe('flip');
    p = reduceX10Phase(p, 'FLIP_DONE', { threeStarCount: 1 });
    expect(p).toBe('flash');
    p = reduceX10Phase(p, 'FLASH_DONE');
    expect(p).toBe('recap');
    p = reduceX10Phase(p, 'CLOSE');
    expect(p).toBe('closed');
  });

  it('k = 0: FLIP_DONE goes to recap, not flash (M-TIM-1)', () => {
    expect(reduceX10Phase('flip', 'FLIP_DONE', { threeStarCount: 0 })).toBe('recap');
  });

  it('TC-MAE-02: BREAK_REQUEST is ignored outside sealed (not in arrive)', () => {
    for (const p of phases.filter((x) => x !== 'sealed')) {
      expect(reduceX10Phase(p, 'BREAK_REQUEST')).toBe(p);
    }
    expect(reduceX10Phase('sealed', 'BREAK_REQUEST')).toBe('break');
  });

  it('TC-MAE-03: SKIP from every non-closed phase → recap, idempotent in recap', () => {
    for (const p of phases) {
      const next = reduceX10Phase(p, 'SKIP');
      expect(next).toBe(p === 'closed' ? 'closed' : 'recap');
    }
    expect(reduceX10Phase('recap', 'SKIP')).toBe('recap');
  });

  it('TC-MAE-04: CLOSE outside recap is ignored', () => {
    for (const p of phases.filter((x) => x !== 'recap')) {
      expect(reduceX10Phase(p, 'CLOSE')).toBe(p);
    }
    expect(reduceX10Phase('recap', 'CLOSE')).toBe('closed');
  });

  it('TC-MAE-05: OPEN_SHEET before recap = SKIP', () => {
    expect(reduceX10Phase('flip', 'OPEN_SHEET')).toBe('recap');
    expect(reduceX10Phase('recap', 'OPEN_SHEET')).toBe('recap');
    expect(reduceX10Phase('closed', 'OPEN_SHEET')).toBe('closed');
  });

  it('TC-MAE-06: UNMOUNT from every phase → closed', () => {
    for (const p of phases) expect(reduceX10Phase(p, 'UNMOUNT')).toBe('closed');
  });

  it('HIDE before recap = SKIP (R-X10-07, transition only)', () => {
    expect(reduceX10Phase('flip', 'HIDE')).toBe('recap');
    expect(reduceX10Phase('recap', 'HIDE')).toBe('recap');
  });

  it('OPEN resumed → recap; OPEN reduced starts at arrive', () => {
    expect(reduceX10Phase('closed', 'OPEN', { resumed: true })).toBe('recap');
    expect(reduceX10Phase('closed', 'OPEN', { reduced: true })).toBe('arrive');
    expect(reduceX10Phase('arrive', 'ARRIVE_DONE', { reduced: true })).toBe('recap');
  });

  it('unknown / stale events do not move the phase', () => {
    const stale: X10Event[] = ['FAN_DONE', 'FLASH_DONE', 'GRID_DONE'];
    expect(reduceX10Phase('sealed', stale[0]!)).toBe('sealed');
  });
});

describe('createX10Runtime with fake timers (0 ms)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('TC-TIM-01: 0 × 3★ reaches recap at 3570 and never flashes', () => {
    const r = createX10Runtime(withK(0), { autoBreak: true });
    expect(r.phase()).toBe('arrive');
    vi.advanceTimersByTime(3569);
    expect(r.phase()).toBe('flip');
    expect(r.flashing()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(r.phase()).toBe('recap');
    expect(r.flashing()).toBeNull();
    expect(r.faceUp()).toHaveLength(10);
  });

  it('TC-TIM-02 / 04: 1 × 3★ flashes once at 3750–3930, recap at 3930, focus schedule 4110', () => {
    const rarities = withK(1);
    const r = createX10Runtime(rarities, { autoBreak: true });
    vi.advanceTimersByTime(3749);
    expect(r.phase()).toBe('flip');
    expect(r.flashing()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(r.phase()).toBe('flash');
    expect(r.flashing()).toBe(flipOrder(rarities)[9]);
    vi.advanceTimersByTime(179);
    expect(r.phase()).toBe('flash');
    vi.advanceTimersByTime(1);
    expect(r.phase()).toBe('recap');
    expect(r.flashing()).toBeNull();
  });

  it('TC-TIM-03 / M-FLA-1: 10 × 3★ — a single flash, on flip-order 9, never 10 flashes', () => {
    const rarities = withK(10);
    const r = createX10Runtime(rarities, { autoBreak: true });
    const seen = new Set<number>();
    for (let t = 0; t <= 4110; t += 10) {
      const f = r.flashing();
      if (f != null) seen.add(f);
      vi.advanceTimersByTime(10);
    }
    expect([...seen]).toEqual([flipOrder(rarities)[9]]);
    expect(r.phase()).toBe('recap');
    expect(r.flashing()).toBeNull();
  });

  it('TC-MAE-03: SKIP from arrive clears timers, no flash, all face-up, recap, idempotent', () => {
    const r = createX10Runtime(withK(3), { autoBreak: true });
    vi.advanceTimersByTime(100);
    r.skip();
    expect(r.phase()).toBe('recap');
    expect(r.pendingTimeouts()).toBe(0);
    expect(r.flashing()).toBeNull();
    expect(r.faceUp()).toHaveLength(10);
    r.skip();
    expect(r.phase()).toBe('recap');
    vi.advanceTimersByTime(10_000);
    expect(r.phase()).toBe('recap');
    expect(r.flashing()).toBeNull();
  });

  it('SKIP during the flash leaves no residual flash (DEF-BT-X10-10)', () => {
    const r = createX10Runtime(withK(1), { autoBreak: true });
    vi.advanceTimersByTime(3750);
    expect(r.flashing()).not.toBeNull();
    r.skip();
    expect(r.flashing()).toBeNull();
    expect(r.phase()).toBe('recap');
    expect(r.pendingTimeouts()).toBe(0);
  });

  it('TC-MAE-02: breakSeal is ignored in arrive', () => {
    const r = createX10Runtime(withK(1), { autoBreak: false });
    expect(r.phase()).toBe('arrive');
    r.breakSeal();
    expect(r.phase()).toBe('arrive');
    vi.advanceTimersByTime(900);
    expect(r.phase()).toBe('sealed');
    r.breakSeal();
    expect(r.phase()).toBe('break');
  });

  it('TC-MAE-04: close is ignored before recap', () => {
    const r = createX10Runtime(withK(0), { autoBreak: true });
    vi.advanceTimersByTime(1000);
    r.close();
    expect(r.phase()).not.toBe('closed');
    vi.advanceTimersByTime(2750);
    expect(r.phase()).toBe('recap');
    r.close();
    expect(r.phase()).toBe('closed');
    expect(r.pendingTimeouts()).toBe(0);
  });

  it('TC-MAE-05: openSheet during flip skips to recap', () => {
    const r = createX10Runtime(withK(2), { autoBreak: true });
    vi.advanceTimersByTime(2440);
    expect(r.phase()).toBe('flip');
    r.openSheet();
    expect(r.phase()).toBe('recap');
    expect(r.pendingTimeouts()).toBe(0);
  });

  it('TC-MAE-06: unmount from each moment clears timers and writes nothing (no pull hook)', () => {
    const r = createX10Runtime(withK(4), { autoBreak: true });
    vi.advanceTimersByTime(2000);
    r.unmount();
    expect(r.phase()).toBe('closed');
    expect(r.pendingTimeouts()).toBe(0);
    expect(r.flashing()).toBeNull();
    vi.advanceTimersByTime(10_000);
    expect(r.phase()).toBe('closed');
  });

  it('reduced motion: all face-up at t=0, recap at 120, no flash', () => {
    const r = createX10Runtime(withK(10), { reduced: true });
    expect(r.faceUp()).toHaveLength(10);
    expect(r.phase()).toBe('arrive');
    vi.advanceTimersByTime(119);
    expect(r.phase()).toBe('arrive');
    vi.advanceTimersByTime(1);
    expect(r.phase()).toBe('recap');
    expect(r.flashing()).toBeNull();
  });

  it('resume: recap immediately, no timers, no flash', () => {
    const r = createX10Runtime(withK(2), { resumed: true });
    expect(r.phase()).toBe('recap');
    expect(r.pendingTimeouts()).toBe(0);
    expect(r.flashing()).toBeNull();
    expect(r.faceUp()).toHaveLength(10);
  });

  it('threeStarCount matches k used by the schedule', () => {
    expect(threeStarCount(withK(0))).toBe(0);
    expect(threeStarCount(withK(1))).toBe(1);
    expect(threeStarCount(withK(7))).toBe(7);
  });
});
