import { describe, expect, it, vi } from 'vitest';
import { sensesText } from '../src/data/wordSenses';

vi.mock('../src/data/vocabulary/extra.json', () => ({
  default: [
    { id: 'word-7a0b-5e8f-5458-cheng2-xu4-yuan2', simplified: '程序员', traditional: '程序員', pinyin: 'chéng xù yuán', senses: [{ text: 'programador' }], characters: ['程', '序', '员'], topicIds: ['trabajo'], sourceId: 'curated-extra' },
  ],
}));

const { extraVocabulary, isExtraWord, vocabulary } = await import('../src/data/vocabulary');
const { EXTRA_LIST, listLabel, studyList, studyLists } = await import('../src/data/lists');
const { allWords, findWord } = await import('../src/data/vocabulary');

describe('Extra vocabulary', () => {
  it('reads extra.json as words without a level', () => {
    expect(extraVocabulary).toHaveLength(1);
    expect(extraVocabulary[0].level).toBeUndefined();
    expect(isExtraWord(extraVocabulary[0])).toBe(true);
    expect(vocabulary.some((word) => word.id === extraVocabulary[0].id)).toBe(false);
  });

  it('is a study list after the HSK levels, and the only list outside them', () => {
    expect(studyLists().map((list) => list.id)).toEqual(['hsk-1', 'hsk-2', 'hsk-3', 'hsk-4', 'hsk-5', 'hsk-6', EXTRA_LIST]);
    expect(studyList(EXTRA_LIST)?.words.map((word) => word.simplified)).toEqual(['程序员']);
    expect(listLabel(['hsk-1', EXTRA_LIST])).toBe('HSK 1 y Extra');
  });

  it('lets search and word pages find Extra words', () => {
    expect(allWords().filter((word) => word.simplified === '程序员')).toHaveLength(1);
    expect(sensesText(findWord('word-7a0b-5e8f-5458-cheng2-xu4-yuan2')?.senses ?? [])).toBe('programador');
  });
});
