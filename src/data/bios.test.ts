import src from '../../docs/BIOS-SOURCE.md?raw';
import { expect, it } from 'vitest';
import { BIOS } from './bios';

/**
 * R-P43-11: BIOS matches docs/BIOS-SOURCE.md exactly. Each entry there is a block
 * `### <id>` + `Auteur : …` + `Date : …` + `Statut : approuvé par Geraldy` + `Texte : …`.
 * No block (today): BIOS must be {}.
 */
it('BIOS equals the approved entries of docs/BIOS-SOURCE.md', () => {
  const entries: Record<string, string> = {};
  for (const block of src.split(/^### /m).slice(1)) {
    const id = block.split('\n')[0]!.trim();
    const field = (k: string) => new RegExp(`^${k} : (.+)$`, 'm').exec(block)?.[1]?.trim();
    expect(field('Auteur'), id).toBeTruthy();
    expect(field('Date'), id).toBeTruthy();
    expect(field('Statut'), id).toBe('approuvé par Geraldy');
    entries[id] = field('Texte') ?? '';
  }
  expect(BIOS).toEqual(entries);
});
