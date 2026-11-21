import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { gameIdFromCreatedAt, sha256, uuidFromDigest16 } from './gameId';

/** Crypto's independent Python hashlib vectors (revue-note-v6-v1.1). */
const VECTORS: readonly [number, string][] = [
  [0, '51221d99-7a98-8fef-befb-2de487064d50'],
  [1, 'be360fea-6686-8003-af84-5b10cba296b5'],
  [1_731_628_800_000, 'b7cb3b61-6bb2-8a7a-acda-2bac2bfd52c9'],
  [1_763_164_800_000, 'f009df26-7c07-8bb4-9398-1356f8a7b828'],
  [2 ** 53 - 1, '2557825c-5db4-8cca-86ed-419cca280d64'],
];

describe('gameIdFromCreatedAt (NV6-09, SHA-256 sync)', () => {
  it.each(VECTORS)('createdAt %s → %s', (createdAt, uuid) => {
    const r = gameIdFromCreatedAt(createdAt);
    expect(r).toEqual({ ok: true, gameId: uuid });
  });

  it('is deterministic and lowercase canonical', () => {
    const a = gameIdFromCreatedAt(0);
    const b = gameIdFromCreatedAt(0);
    expect(a).toEqual(b);
    if (!a.ok) return;
    expect(a.gameId).toBe(a.gameId.toLowerCase());
    expect(a.gameId[14]).toBe('8'); // version 8
    const variant = parseInt(a.gameId.slice(19, 20), 16);
    expect(variant >= 8 && variant <= 11).toBe(true); // 10xx
  });

  it('rejects a non-integer or out-of-range createdAt', () => {
    for (const n of [-1, 1.5, Number.NaN, Infinity, 2 ** 53]) {
      expect(gameIdFromCreatedAt(n as number)).toEqual({
        ok: false,
        reason: 'invalid-createdAt',
      });
    }
  });

  it('kills the little-endian and missing-NUL mutants', () => {
    // Payload without the NUL, or little-endian createdAt, must not match the vector.
    const prefix = new TextEncoder().encode('thegameshow.v6.gameId');
    const noNul = new Uint8Array(prefix.length + 8);
    noNul.set(prefix, 0);
    // big-endian 0 already all zeroes; use createdAt = 1
    noNul[noNul.length - 1] = 1;
    const digest = sha256(noNul);
    expect(uuidFromDigest16(digest)).not.toBe('be360fea-6686-8003-af84-5b10cba296b5');

    const le = new Uint8Array(prefix.length + 1 + 8);
    le.set(prefix, 0);
    le[prefix.length] = 0;
    le[prefix.length + 1] = 1; // little-endian 1
    expect(uuidFromDigest16(sha256(le))).not.toBe('be360fea-6686-8003-af84-5b10cba296b5');
  });
  it('matches node crypto SHA-256 when padding needs a second block (≥ 56 bytes, N32)', () => {
    // The gameId payload is 31 bytes, so it never reaches the FIPS case where
    // the 0x80 pad and the 8-byte bit length do not fit in the same block.
    // Lengths 56..63 (and 119, 120) force that extra block and kill N32.
    // N33 (bitLenHi forced to 0) is equivalent for every input shorter than
    // 2^29 bytes; a 512 MiB vector is out of scope for this suite.
    const hex = (u: Uint8Array) => [...u].map((b) => b.toString(16).padStart(2, '0')).join('');
    const nodeSha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
    for (const len of [0, 55, 56, 57, 63, 64, 65, 119, 120]) {
      const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 7 + 3) & 0xff);
      expect(hex(sha256(bytes)), `len=${len}`).toBe(nodeSha(bytes));
    }
  });
});
