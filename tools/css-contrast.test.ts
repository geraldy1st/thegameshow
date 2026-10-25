// RES-10 / DESIGN-BRIEF R1-R4: no gold or coral text on cream. Rules whose selector targets a
// cream surface (.card, .on-cream, dialog) may only colour text with ink tokens.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const UI = join(__dirname, '..', 'src', 'ui');
const CREAM_SCOPE = /\.card\b|\.on-cream\b|\bdialog\b/;
const ALLOWED_TEXT = new Set([
  'var(--ink)',
  'var(--card-fg)',
  'var(--muted-ink)',
  'var(--gold-ink)',
  'var(--coral-ink)',
  'inherit',
]);
const RAW_GOLD_CORAL = /#f5b83d|#ff6b5e|var\(--(gold|coral|accent|alert|focus)\)/i;

function rules(css: string): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(re)) {
    out.push({ selector: (m[1] ?? '').trim(), body: m[2] ?? '' });
  }
  return out;
}

describe('no gold/coral text on cream', () => {
  const files = readdirSync(UI).filter((f) => f.endsWith('.css') && f !== 'tokens.css');
  it('finds stylesheets', () => expect(files.length).toBeGreaterThan(0));
  for (const f of files) {
    it(f, () => {
      for (const { selector, body } of rules(readFileSync(join(UI, f), 'utf8'))) {
        if (!CREAM_SCOPE.test(selector) || selector.includes('::backdrop')) continue;
        const color = /(?:^|;)\s*color\s*:\s*([^;]+)/.exec(body)?.[1]?.trim();
        if (color) expect(ALLOWED_TEXT, `${f} ${selector} color:${color}`).toContain(color);
        const outline = /outline(?:-color)?\s*:\s*([^;]+)/.exec(body)?.[1] ?? '';
        expect(RAW_GOLD_CORAL.test(outline), `${f} ${selector} focus ring on cream`).toBe(false);
      }
    });
  }
  it('cream text never sits on gold or coral backgrounds', () => {
    for (const f of files) {
      for (const { selector, body } of rules(readFileSync(join(UI, f), 'utf8'))) {
        const bg = /background(?:-color)?\s*:\s*([^;]+)/.exec(body)?.[1] ?? '';
        const color = /(?:^|;)\s*color\s*:\s*([^;]+)/.exec(body)?.[1]?.trim() ?? '';
        if (/--gold\)|--coral\)/.test(bg)) expect(color, `${f} ${selector}`).toBe('var(--ink)');
      }
    }
  });
});
