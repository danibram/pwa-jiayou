import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const read = <T>(path: string): T[] =>
  existsSync(join(root, path)) ? JSON.parse(readFileSync(join(root, path), 'utf8')) : [];
const levels = [1, 2, 3, 4, 5, 6];

interface Word { simplified: string; traditional: string }
interface Row { character: string; traditional: string | null }

const words = levels.flatMap((level) => read<Word>(`src/data/vocabulary/hsk${level}.json`));
const characters = [
  ...levels.flatMap((level) => read<Row>(`src/data/hsk${level}.json`)),
  ...levels.slice(1).flatMap((level) => read<Row>(`public/packs/hsk${level}.json`)),
];

/** CJK Extension A and anything outside the BMP: rare forms no learner should see. */
const rare = (text: string) => [...text].filter((char) => {
  const code = char.codePointAt(0) ?? 0;
  return (code >= 0x3400 && code <= 0x4dbf) || code > 0xffff;
});

/** Variants the source data picked over the standard form. */
const KNOWN_BAD = '咊嵗晻徧辢嬾墻跴擧捄飃凴虵胷亱煑舖竪綉裏';

describe('traditional forms', () => {
  it('never use an Extension A or astral form', () => {
    const hits = [...words.map((w) => [w.simplified, w.traditional]), ...characters.map((c) => [c.character, c.traditional ?? ''])]
      .filter(([, trad]) => rare(trad).length > 0);
    expect(hits).toEqual([]);
  });

  it('never use a known variant', () => {
    const hits = words.filter((w) => [...w.traditional].some((char) => KNOWN_BAD.includes(char)));
    expect(hits.map((w) => `${w.simplified} ${w.traditional}`)).toEqual([]);
  });

  it('pick the right sense for single-character words', () => {
    const trad = (simplified: string) => words.find((w) => w.simplified === simplified)?.traditional;
    expect(trad('碗')).toBe('碗');
    expect(trad('布')).toBe('布');
    expect(trad('脏')).toBe('髒');
    expect(trad('听')).toBe('聽');
  });

  it('give every character a traditional form', () => {
    expect(characters.filter((c) => !c.traditional).map((c) => c.character)).toEqual([]);
  });
});
