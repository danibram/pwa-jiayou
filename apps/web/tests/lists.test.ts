import { describe, expect, it } from 'vitest';
import { hskLevelsOf, knownLists, listLabel } from '../src/data/lists';
import { studyLists } from '../src/stores/studyLists';

describe('study list ids', () => {
  it('know every list without reading the extra words', () => {
    expect(knownLists(['extra', 'nope', 'hsk-2', 'hsk-1'])).toEqual(['hsk-1', 'hsk-2', 'extra']);
    expect(knownLists(studyLists().map((list) => list.id))).toEqual(studyLists().map((list) => list.id));
    expect(hskLevelsOf(['extra', 'hsk-3', 'hsk-1'])).toEqual([1, 3]);
    expect(listLabel(['hsk-1', 'hsk-3', 'hsk-2'])).toBe('HSK 1, 2 y 3');
  });
});
