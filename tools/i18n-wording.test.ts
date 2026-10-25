// Ethics (MVP-DRAFT, AVIS-QA): no urgency or scarcity wording in the UI strings.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FORBIDDEN = /limit[ée]|dernière chance|vite\s*!|offre|expire|achet(er|ez) des tickets|€/i;

describe('fr strings', () => {
  it('contain no urgency, scarcity or purchase wording', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'i18n', 'fr.ts'), 'utf8');
    const hits = src.split('\n').filter((l) => FORBIDDEN.test(l));
    expect(hits).toEqual([]);
  });
});
