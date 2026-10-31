import { describe, expect, it } from 'vitest';
import { WRITER_LOCK_RETRY_MS, webLocksWriter } from './gameStore';

/** Fake LockManager whose lock is held by a closing tab until `freeAfter` attempts. */
function fakeLocks(freeAfter: number) {
  let attempts = 0;
  const locks = {
    request: (
      _name: string,
      _opts: { ifAvailable: boolean },
      cb: (lock: { name: string } | null) => unknown,
    ) => {
      attempts++;
      void cb(attempts > freeAfter ? { name: 'thegameshow-writer' } : null);
      return Promise.resolve(undefined);
    },
  } as unknown as Pick<LockManager, 'request'>;
  return { locks, attempts: () => attempts };
}

describe('writer lock retries (DEF-GS-13)', () => {
  const slept: number[] = [];
  const sleep = async (ms: number) => void slept.push(ms);

  it('a lock released late by a just-closed tab is taken on a retry', async () => {
    slept.length = 0;
    const f = fakeLocks(2);
    expect(await webLocksWriter(f.locks, WRITER_LOCK_RETRY_MS, sleep)).toBe(true);
    expect(f.attempts()).toBe(3);
    expect(slept).toEqual([50, 100]);
  });
  it('a lock free at once needs no retry', async () => {
    slept.length = 0;
    expect(await webLocksWriter(fakeLocks(0).locks, WRITER_LOCK_RETRY_MS, sleep)).toBe(true);
    expect(slept).toEqual([]);
  });
  it('a lock really held by another tab ends read-only after a bounded backoff', async () => {
    slept.length = 0;
    const f = fakeLocks(Infinity);
    expect(await webLocksWriter(f.locks, WRITER_LOCK_RETRY_MS, sleep)).toBe(false);
    expect(f.attempts()).toBe(1 + WRITER_LOCK_RETRY_MS.length);
    expect(slept.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(2000);
  });
  it('without Web Locks the revision compare-and-set alone protects', async () => {
    expect(await webLocksWriter(undefined)).toBe(true);
  });
});
