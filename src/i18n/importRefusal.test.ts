import { describe, expect, it } from 'vitest';
import { fr, importRefusalMessage, t } from './fr';
import { EXPORT_FORMAT, MAX_IMPORT_BYTES, fnv1a, parseImport } from '../save/exportImport';
import midgameV4 from '../save/__fixtures__/v4-midgame.json';

const AP = '\u2019';
const UNCHANGED = 'Ta partie actuelle n’a pas changé.';

/** Exact player-facing copy, asserted so a mutant that drops a sentence or leaks English fails. */
const COPY = {
  notJson: 'Ce fichier n’a pas pu être lu. Ta partie actuelle n’a pas changé.',
  tooLarge: 'Ce fichier est trop lourd pour être importé. Ta partie actuelle n’a pas changé.',
  envelope: 'Ce fichier n’est pas une sauvegarde The Gameshow. Ta partie actuelle n’a pas changé.',
  checksum:
    'Ce fichier a été modifié ou abîmé, il ne peut pas être importé. Ta partie actuelle n’a pas changé.',
  newer:
    'Cette partie vient d’une version plus récente du jeu. Recharge la page pour passer à la dernière version, puis réessaie l’import.',
  other: 'Ce fichier n’a pas pu être importé. Ta partie actuelle n’a pas changé.',
} as const;

const LEAK =
  /Fichier refusé|not JSON|file too large|checksum mismatch|envelope:|newer than this app|write-failed|invalid save|schemaVersion/i;

function envelope(save: unknown, checksum = fnv1a(JSON.stringify(save))): string {
  return JSON.stringify({ format: EXPORT_FORMAT, checksum, save });
}

describe('DEF-GS-59 import refusal copy', () => {
  it('uses typographic apostrophes and has no ASCII apostrophe or bare colon', () => {
    for (const msg of Object.values(COPY)) {
      expect(msg.includes(AP), msg).toBe(true);
      expect(msg.includes("'"), msg).toBe(false);
      expect(msg.includes(':'), msg).toBe(false);
    }
  });

  it.each([
    ['not JSON', COPY.notJson],
    ['file too large', COPY.tooLarge],
    ['envelope: object expected', COPY.envelope],
    ['envelope: unexpected keys', COPY.envelope],
    ['envelope: wrong format', COPY.envelope],
    ['checksum mismatch', COPY.checksum],
    ['save.schemaVersion: 6 is newer than this app', COPY.newer],
    ['save.schemaVersion: 7 is newer than this app', COPY.newer],
    ['future-schema', COPY.newer],
    ['invalid save', COPY.other],
    ['save: object expected', COPY.other],
    ['save.schemaVersion: unknown', COPY.other],
    ['storage unavailable', COPY.other],
    ['read-only tab', COPY.other],
  ] as const)('maps %s to the approved message and never leaks English', (reason, text) => {
    expect(importRefusalMessage(reason), reason).toBe(text);
    expect(text, reason).not.toMatch(LEAK);
    expect(importRefusalMessage(reason), reason).not.toMatch(LEAK);
  });

  it('does not add the reassurance sentence on a newer-schema refusal', () => {
    expect(importRefusalMessage('future-schema')).toBe(COPY.newer);
    expect(COPY.newer.includes(UNCHANGED)).toBe(false);
    expect(COPY.notJson.includes(UNCHANGED)).toBe(true);
  });

  it('still routes write-failed to saveWriteFailed (DEF-GS-58)', () => {
    expect(importRefusalMessage('write-failed')).toBe(t('saveWriteFailed'));
    expect(importRefusalMessage('write-failed')).not.toBe(COPY.other);
  });

  it('tokens match the helper so a drifted key is caught', () => {
    expect(t('importNotJson')).toBe(COPY.notJson);
    expect(t('importTooLarge')).toBe(COPY.tooLarge);
    expect(t('importBadEnvelope')).toBe(COPY.envelope);
    expect(t('importChecksum')).toBe(COPY.checksum);
    expect(t('importNewerSchema')).toBe(COPY.newer);
    expect(t('importFailed')).toBe(COPY.other);
    expect(t('exportFailed')).toBe(
      'La sauvegarde n’a pas pu être exportée. Réessaie dans un instant.',
    );
    expect(new Set(Object.values(COPY)).size).toBe(6);
    expect(fr.importFailed.includes('{reason}')).toBe(false);
  });
});

describe('DEF-GS-59 parseImport reasons map to the same copy', () => {
  it('not JSON', () => {
    const r = parseImport('{');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('not JSON');
    expect(importRefusalMessage(r.reason)).toBe(COPY.notJson);
  });

  it('too large', () => {
    const r = parseImport('x'.repeat(MAX_IMPORT_BYTES + 1));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('file too large');
    expect(importRefusalMessage(r.reason)).toBe(COPY.tooLarge);
  });

  it('envelope variants', () => {
    for (const text of [
      '[]',
      JSON.stringify({ format: 'other', checksum: '00', save: {} }),
      JSON.stringify({ format: EXPORT_FORMAT, checksum: '00', save: {}, extra: 1 }),
    ]) {
      const r = parseImport(text);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason.startsWith('envelope:'), r.reason).toBe(true);
      expect(importRefusalMessage(r.reason)).toBe(COPY.envelope);
    }
  });

  it('checksum', () => {
    const r = parseImport(envelope({ schemaVersion: 5 }, '00000000'));
    expect(r).toEqual({ ok: false, reason: 'checksum mismatch' });
    expect(importRefusalMessage('checksum mismatch')).toBe(COPY.checksum);
  });

  it('newer schema', () => {
    const save = { ...(midgameV4 as object), schemaVersion: 6 };
    const r = parseImport(envelope(save));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/is newer than this app/);
    expect(importRefusalMessage(r.reason)).toBe(COPY.newer);
  });

  it('other invalid save uses the fallback', () => {
    const r = parseImport(envelope({ junk: true }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).not.toMatch(
      /not JSON|file too large|envelope:|checksum mismatch|newer than this app/,
    );
    expect(importRefusalMessage(r.reason)).toBe(COPY.other);
  });
});
