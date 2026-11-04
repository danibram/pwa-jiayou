import { describe, expect, it } from 'vitest';
import { KEYS } from '../src/persistence/keys';
import { createMemoryKeyValue } from '../src/persistence/keyValue';
import { createProgressStore, progressStore } from '../src/stores/progressStore';
import { createProgressState } from '../src/stores/progressState';
import { createVocabularyProgressStore } from '../src/stores/vocabularyProgressStore';

describe('progress store factory', () => {
  it('starts from clean progress, apart from the app instance', () => {
    progressStore.grade('好', 'good');
    const repo = createMemoryKeyValue();
    const doc = createProgressState(repo);
    const chars = createProgressStore(doc);
    const words = createVocabularyProgressStore(doc);
    expect(chars.isNew('好')).toBe(true);
    chars.grade('一', 'good');
    words.grade('word-1', 'again');
    expect(progressStore.isNew('一')).toBe(true);
    // Both stores write one shared document to their repo, under the usual key.
    expect(JSON.parse(repo.read(KEYS.progress)!)).toMatchObject({ chars: { 一: { right: 1 } }, words: { 'word-1': { wrong: 1 } } });
    expect(words.isWeak('word-1')).toBe(true);
    expect(chars.streak()).toBe(1);
    progressStore.clear();
  });

  it('loads what the repo already holds', () => {
    const repo = createMemoryKeyValue();
    createProgressStore(createProgressState(repo)).grade('二', 'good');
    const reloaded = createProgressStore(createProgressState(repo));
    expect(reloaded.get('二')?.right).toBe(1);
  });
});
