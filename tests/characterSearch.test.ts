import { describe, expect, it } from 'vitest';
import {
  indexSize,
  pinyinSyllableHighlights,
  searchCharacters,
} from '../src/utils/characterSearch';
import type { HSKCharacter } from '../src/types';

const deviceOnly: HSKCharacter = {
  character: '𡃁',
  traditional: '𡃁',
  pinyin: 'xx',
  definition: '',
  radical: '',
  stroke_count: 16,
  hsk_level: 1,
  general_standard: 0,
  frequency_rank: 0,
};

describe('characterSearch', () => {
  it('returns the full index when the query is empty', () => {
    expect(searchCharacters('', []).length).toBe(indexSize());
    expect(indexSize()).toBeGreaterThan(2600);
  });

  it('finds by simplified hanzi', () => {
    const hits = searchCharacters('饭', []);
    expect(hits.some((h) => h.kind === 'listed' && h.row.character === '饭')).toBe(true);
  });

  it('finds by toneless pinyin', () => {
    const hits = searchCharacters('wei', []);
    expect(hits.some((h) => h.kind === 'listed' && h.row.character === '为')).toBe(true);
  });

  it('finds by Spanish meaning, ignoring accents', () => {
    expect(searchCharacters('agua', []).some((h) => h.kind === 'listed' && h.row.character === '水')).toBe(true);
    expect(searchCharacters('AGUA', []).some((h) => h.kind === 'listed' && h.row.character === '水')).toBe(true);
  });

  it('includes device-only characters not in the index', () => {
    const hits = searchCharacters('𡃁', [deviceOnly]);
    expect(hits).toEqual([{ kind: 'device', character: deviceOnly }]);
  });

  it('highlights syllables that overlap the toneless query', () => {
    expect(pinyinSyllableHighlights('wèi', 'wei')).toEqual([true]);
    expect(pinyinSyllableHighlights('wéi, wèi', 'wei')).toEqual([true, true]);
    expect(pinyinSyllableHighlights('wèi', 'w')).toEqual([true]);
    expect(pinyinSyllableHighlights('wèi', '饭')).toEqual([]);
  });
});
