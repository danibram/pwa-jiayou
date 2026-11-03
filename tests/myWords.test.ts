import { afterEach, describe, expect, it, vi } from 'vitest';
import { listLabel } from '../src/data/lists';
import { wordsInLists } from '../src/stores/studyLists';
import { allWords, charactersOfOwnTopicWords, findWord, myWordsStore } from '../src/stores/myWordsStore';
import { vocabularyStore } from '../src/stores/vocabularyStore';
import { markTones } from '../src/utils/pinyin';

afterEach(() => {
  myWordsStore.reset();
  vocabularyStore.reset();
  localStorage.clear();
});

describe('markTones', () => {
  it('turns tone numbers into marks and leaves marked pinyin alone', () => {
    expect(markTones('ni3 hao3')).toBe('nǐ hǎo');
    expect(markTones('lv4 xie5')).toBe('lǜ xie');
    expect(markTones('dou1 gui4')).toBe('dōu guì');
    expect(markTones('Xiè xie')).toBe('xiè xie');
  });
});

describe('Mis palabras', () => {
  it('warns when saving fails and clears the warning after retry', () => {
    const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('full'); });
    myWordsStore.add({ simplified: '奶茶', pinyin: 'nai3 cha2', meaning: 'té con leche' });
    expect(myWordsStore.storageError()).toBe(true);
    write.mockRestore();
    myWordsStore.retrySave();
    expect(myWordsStore.storageError()).toBe(false);
    expect(localStorage.getItem('jiayou-my-words')).toContain('奶茶');
  });
  it('stores a word outside HSK and finds it everywhere', () => {
    const { word, inCatalog } = myWordsStore.add({ simplified: '奶茶', pinyin: 'nai3 cha2', meaning: 'té con leche' });
    expect(inCatalog).toBe(false);
    expect(word.id).toBe('word-5976-8336-nai3-cha2');
    expect(word.pinyin).toBe('nǎi chá');
    expect(word.level).toBeUndefined();
    expect(word.topicIds).toEqual([]);
    expect(findWord(word.id)?.meaning).toBe('té con leche');
    expect(allWords().some((entry) => entry.id === word.id)).toBe(true);
    expect(wordsInLists(['mine']).map((entry) => entry.id)).toEqual([word.id]);
  });

  it('keeps the topics the learner picked, and drops unknown ones', () => {
    const { word } = myWordsStore.add({ simplified: '奶茶', pinyin: 'nai3 cha2', meaning: 'té con leche', topicIds: ['comida', 'no-existe', 'comida'] });
    expect(word.topicIds).toEqual(['comida']);
    vocabularyStore.toggleList('mine');
    expect(vocabularyStore.getSelectedWords().find((entry) => entry.id === word.id)?.topicIds).toEqual(['comida']);
  });

  it('lists characters of own topic words, skipping glyphs that are already a word in the list', () => {
    const { word: curry } = myWordsStore.add({ simplified: '咖喱', pinyin: 'ka1 li2', meaning: 'curry', topicIds: ['comida'] });
    const { word: gel } = myWordsStore.add({ simplified: '喱', pinyin: 'li2', meaning: 'gel', topicIds: ['comida'] });
    expect(charactersOfOwnTopicWords(['comida'], [curry, gel])).toEqual(['咖']);
    expect(charactersOfOwnTopicWords(['familia'], [curry, gel])).toEqual([]);
  });

  it('references a catalog word with the same reading, so progress is shared', () => {
    const { word, inCatalog, corrected } = myWordsStore.add({
      simplified: '朋友',
      pinyin: 'péng you',
      meaning: 'amigo; amiga',
      topicIds: ['familia', 'personas'],
    });
    expect(inCatalog).toBe(true);
    expect(corrected).toBe(false);
    expect(word.id).toBe('word-670b-53cb-peng2-you5');
    expect(word.meaning).toBe('amigo; amiga');
    expect(myWordsStore.ownWords()).toEqual([]);
    expect(wordsInLists(['hsk-1', 'mine']).filter((entry) => entry.id === word.id)).toHaveLength(1);
  });

  it('stores a correction of an HSK word under the same id', () => {
    const { word, inCatalog, corrected } = myWordsStore.add({
      simplified: '朋友',
      pinyin: 'péng you',
      meaning: 'colega',
      topicIds: ['familia'],
    });
    expect(inCatalog).toBe(true);
    expect(corrected).toBe(true);
    expect(word.id).toBe('word-670b-53cb-peng2-you5');
    expect(word.meaning).toBe('colega');
    expect(word.level).toBe(1);
    expect(myWordsStore.isCorrection(word.id)).toBe(true);
    expect(findWord(word.id)?.meaning).toBe('colega');
    expect(wordsInLists(['hsk-1']).find((entry) => entry.id === word.id)?.meaning).toBe('colega');
  });

  it('keeps another reading of the same hanzi apart', () => {
    const { word, inCatalog } = myWordsStore.add({ simplified: '还', pinyin: 'huan2', meaning: 'devolver' });
    expect(inCatalog).toBe(false);
    expect(word.id).toBe('word-8fd8-huan2');
    expect(findWord('word-8fd8-hai2')?.meaning).toMatch(/todavía/);
  });

  it('rejects words it cannot place', () => {
    expect(() => myWordsStore.add({ simplified: 'panda', pinyin: 'pan da', meaning: 'x' })).toThrow(/caracteres chinos/);
    expect(() => myWordsStore.add({ simplified: '奶茶', pinyin: 'naicha', meaning: 'x' })).toThrow(/una sílaba/);
    expect(() => myWordsStore.add({ simplified: '奶茶', pinyin: 'nai3 cha2', meaning: ' ' })).toThrow(/significado/);
    expect(myWordsStore.ids).toEqual([]);
  });

  it('keeps the id when a typo is fixed, and the progress with it', () => {
    const { word } = myWordsStore.add({ simplified: '奶茶', pinyin: 'nai3 cha1', meaning: 'té' });
    myWordsStore.update(word.id, { simplified: '奶茶', pinyin: 'nai3 cha2', meaning: 'té con leche' });
    expect(findWord(word.id)).toMatchObject({ pinyin: 'nǎi chá', meaning: 'té con leche' });
    const again = myWordsStore.add({ simplified: '奶茶', pinyin: 'nai3 cha2', meaning: 'té con leche' });
    expect(again).toMatchObject({ alreadyListed: true, word: { id: word.id } });
    expect(myWordsStore.ownWords()).toHaveLength(1);
  });

  it('is a list the learner can select, named by its title', () => {
    myWordsStore.add({ simplified: '奶茶', pinyin: 'nai3 cha2', meaning: 'té con leche' });
    vocabularyStore.toggleList('mine');
    expect(vocabularyStore.listLabel()).toBe('HSK 1 y Mis palabras');
    expect(vocabularyStore.getSelectedWords().some((entry) => entry.simplified === '奶茶')).toBe(true);
    expect(listLabel(['mine'])).toBe('Mis palabras');
  });

  it('survives a reload and drops only the bad entries of saved data', () => {
    localStorage.setItem('jiayou-my-words', JSON.stringify({
      ids: ['word-5976-8336-nai3-cha2', 'word-bad', 'word-670b-53cb-peng2-you5'],
      own: {
        'word-5976-8336-nai3-cha2': { simplified: '奶茶', traditional: '奶茶', pinyin: 'nǎi chá', meaning: 'té con leche' },
        'word-bad': { simplified: 'x', pinyin: 'x', meaning: 'x' },
      },
    }));
    const restored = myWordsStore.checkData(JSON.parse(localStorage.getItem('jiayou-my-words')!.replace(',"word-bad":{"simplified":"x","pinyin":"x","meaning":"x"}', '')));
    expect(restored.ids).toEqual(['word-5976-8336-nai3-cha2', 'word-670b-53cb-peng2-you5']);
    expect(() => myWordsStore.checkData(JSON.parse(localStorage.getItem('jiayou-my-words')!))).toThrow();
  });
});
