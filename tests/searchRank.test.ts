import { describe, expect, it } from 'vitest';
import { searchCharacters } from '../src/utils/characterSearch';
import { rankBy, searchScore } from '../src/utils/searchRank';
import { vocabulary } from '../src/data/vocabulary';

const firstChars = (query: string) =>
  searchCharacters(query, []).slice(0, 3).map((hit) => (hit.kind === 'listed' ? hit.row.character : hit.character.character));

const words = (query: string) =>
  rankBy(vocabulary, query, (word) => ({ hanzi: [word.simplified, word.traditional], pinyin: word.pinyin, gloss: word.meaning }))
    .map((word) => word.simplified);

describe('search ranking', () => {
  it('puts the gloss head word first', () => {
    expect(firstChars('agua')[0]).toBe('水');
    expect(words('agua')[0]).toBe('水');
  });

  it('does not match pinyin across syllables', () => {
    expect(searchScore({ hanzi: ['把关'], pinyin: 'bǎ guān', gloss: 'controlar' }, 'agua')).toBe(0);
    expect(words('agua')).not.toContain('把关');
  });

  it('matches pinyin from syllable starts, with or without spaces', () => {
    expect(words('beijing')).toContain('北京');
    expect(words('shui')).toContain('水');
  });

  it('treats typed u as ü, so nu finds 女儿 and nv still does', () => {
    expect(words('nu')).toContain('女儿');
    expect(words('nv')).toContain('女儿');
    expect(firstChars('nu')).toContain('女');
  });

  it('finds perdonar', () => {
    expect(words('perdonar')).toContain('原谅');
  });

  it('matches Spanish on whole words, not inside longer ones', () => {
    expect(searchScore({ hanzi: ['忍'], pinyin: 'rěn', gloss: 'aguantar; soportar' }, 'agua')).toBe(0);
    expect(words('agua')).not.toContain('忍');
  });

  it('finds other forms of the same word', () => {
    expect(searchScore({ hanzi: ['对不起'], pinyin: 'duì bu qǐ', gloss: 'lo siento; perdón' }, 'perdonar')).toBeGreaterThan(0);
  });

  it('falls back to prefixes only for long queries with no whole-word match', () => {
    const rows = [{ hanzi: ['黄油'], pinyin: 'huáng yóu', gloss: 'mantequilla' }];
    expect(rankBy(rows, 'mantequ', (row) => row)).toHaveLength(1);
    expect(rankBy(rows, 'mant', (row) => row)).toHaveLength(0);
  });
});
