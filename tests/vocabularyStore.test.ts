import { afterEach, describe, expect, it } from 'vitest';
import { vocabularyCoverage } from '../src/data/vocabulary';
import { vocabularyStore } from '../src/stores/vocabularyStore';

afterEach(() => {
  vocabularyStore.reset();
  localStorage.clear();
});

describe('vocabularyStore', () => {
  it('defaults to HSK 1 and refuses to clear the last list', () => {
    expect(vocabularyStore.state.selectedLists).toEqual(['hsk-1']);
    vocabularyStore.toggleList('hsk-1');
    expect(vocabularyStore.state.selectedLists).toEqual(['hsk-1']);
    expect(vocabularyStore.getSelectedWords()).toHaveLength(vocabularyCoverage.counts[1]);
  });

  it('toggles lists and persists the selection', () => {
    vocabularyStore.toggleList('hsk-2');
    expect(vocabularyStore.state.selectedLists).toEqual(['hsk-1', 'hsk-2']);
    expect(vocabularyStore.getSelectedWords()).toHaveLength(
      vocabularyCoverage.counts[1] + vocabularyCoverage.counts[2],
    );
    expect(JSON.parse(localStorage.getItem('jiayou-study-lists')!).selectedLists).toEqual(['hsk-1', 'hsk-2']);
    expect(vocabularyStore.listLabel()).toBe('HSK 1 y 2');
    vocabularyStore.toggleList('hsk-1');
    expect(vocabularyStore.state.selectedLists).toEqual(['hsk-2']);
    expect(vocabularyStore.listLabel()).toBe('HSK 2');
  });

  it('ignores unknown lists and keeps catalog order', () => {
    vocabularyStore.selectLists(['hsk-3', 'nope', 'hsk-1']);
    expect(vocabularyStore.state.selectedLists).toEqual(['hsk-1', 'hsk-3']);
    vocabularyStore.selectLists(['nope']);
    expect(vocabularyStore.state.selectedLists).toEqual(['hsk-1']);
  });
});
