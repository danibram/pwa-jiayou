import { describe, expect, it } from 'vitest';
import { parseVocabularyEntry, wordExamples, type VocabularyExample } from '../src/vocabulary.ts';

const row = {
  id: 'word-1', simplified: '看', traditional: '看', pinyin: 'kàn', level: 1,
  senses: [{ pos: 'verbo', text: 'mirar' }], characters: ['看'], topicIds: [], sourceId: 'hsk-2-0',
};
const one: VocabularyExample = { chinese: '我在看书。', spanish: 'Estoy leyendo.' };
const two: VocabularyExample = { chinese: '你看，下雨了。', pinyin: 'Nǐ kàn, xià yǔ le.', spanish: 'Mira, está lloviendo.' };

describe('word sentences', () => {
  it('reads the list first, then the single legacy sentence, then the sidecar one', () => {
    expect(wordExamples({ examples: [one, two], example: one })).toEqual([one, two]);
    expect(wordExamples({ examples: [] }, one)).toEqual([]);
    expect(wordExamples({ example: two }, one)).toEqual([two]);
    expect(wordExamples({}, one)).toEqual([one]);
    expect(wordExamples({ example: null }, one)).toEqual([]);
  });

  it('parses a list with optional readings and refuses an incomplete sentence', () => {
    expect(parseVocabularyEntry({ ...row, examples: [one, two] }).examples).toEqual([one, two]);
    expect(() => parseVocabularyEntry({ ...row, examples: [{ chinese: '看', spanish: '' }] })).toThrow('Frases inválidas');
    expect(() => parseVocabularyEntry({ ...row, examples: [{ ...two, pinyin: ' ' }] })).toThrow('Frases inválidas');
  });
});
