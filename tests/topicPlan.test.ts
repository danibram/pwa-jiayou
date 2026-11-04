import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WORD_NEW_PER_DAY, progressStore, vocabularyProgressStore } from '../src/stores/progressStore';
import { vocabularyStore } from '../src/stores/vocabularyStore';
import { topicPlan, topicWords } from '../src/utils/topicPlan';
import { vocabulary } from '../src/data/vocabulary';

vi.mock('../src/data/vocabulary/extra.json', async () => ({ default: (await import('./fixtures/extraWords')).extraWords }));

beforeEach(() => {
  localStorage.clear();
  progressStore.clear();
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

  it('includes Extra topic words when the Extra list is checked', () => {
    expect(topicWords(['trabajos'], ['hsk-1']).map((entry) => entry.simplified)).not.toContain('程序员');
    expect(topicWords(['trabajos'], ['hsk-1', 'extra']).map((entry) => entry.simplified)).toContain('程序员');
  });
});
