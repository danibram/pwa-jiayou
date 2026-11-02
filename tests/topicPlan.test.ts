import { beforeEach, describe, expect, it } from 'vitest';
import { WORD_NEW_PER_DAY, progressStore, vocabularyProgressStore } from '../src/stores/progressStore';
import { myWordsStore } from '../src/stores/myWordsStore';
import { vocabularyStore } from '../src/stores/vocabularyStore';
import { topicPlan, topicWords } from '../src/utils/topicPlan';
import { vocabulary } from '../src/data/vocabulary';

beforeEach(() => {
  localStorage.clear();
  progressStore.clear();
  myWordsStore.reset();
  vocabularyStore.reset();
});

describe('topic plan', () => {
  it('offers new words until the daily cap, then says it is capped', () => {
    const familia = topicWords(['familia'], ['hsk-1', 'hsk-2']);
    expect(familia.length).toBeGreaterThan(0);
    expect(topicPlan(['familia'], ['hsk-1', 'hsk-2'])).toMatchObject({ review: 0, capped: false });
    expect(topicPlan(['familia'], ['hsk-1', 'hsk-2']).fresh).toBeGreaterThan(0);
    // Spend the cap on words outside the topic.
    for (const entry of vocabulary.filter((word) => !word.topicIds.includes('familia')).slice(0, WORD_NEW_PER_DAY)) {
      vocabularyProgressStore.grade(entry.id, 'good');
    }
    expect(topicPlan(['familia'], ['hsk-1', 'hsk-2'])).toEqual({ fresh: 0, review: 0, capped: true });
  });

  it('counts known words as review even when capped', () => {
    const [first] = topicWords(['familia'], ['hsk-1', 'hsk-2']);
    vocabularyProgressStore.grade(first.id, 'good');
    expect(topicPlan(['familia'], ['hsk-1', 'hsk-2']).review).toBe(1);
  });

  it('includes own topic words when Mis palabras is not in the list ids', () => {
    const { word } = myWordsStore.add({ simplified: '程序员', pinyin: 'cheng2 xu4 yuan2', meaning: 'programador', topicIds: ['trabajos'] });
    const ids = topicWords(['trabajos'], ['hsk-1']).map((entry) => entry.id);
    expect(ids).toContain(word.id);
  });
});
