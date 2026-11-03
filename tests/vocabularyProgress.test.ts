import { beforeEach, describe, expect, it, vi } from 'vitest';

const stores = async () => {
  vi.resetModules();
  const { progressStore } = await import('../src/stores/progressStore');
  const { vocabularyProgressStore } = await import('../src/stores/vocabularyProgressStore');
  return { chars: progressStore, words: vocabularyProgressStore };
};

describe('vocabulary progress', () => {
  beforeEach(() => localStorage.clear());

  it('keeps characters and words apart and round trips both histories', async () => {
    localStorage.setItem('hsk-flashcards-stats', JSON.stringify({ version: 4, chars: { 好: { right: 4, interval: 21 } }, daily: { day: '2026-10-31', reviewed: 1, introduced: 1, streak: 1 }, words: {}, wordDaily: { day: '2026-10-31', reviewed: 0, introduced: 0, streak: 0 } }));
    const { chars, words } = await stores();
    expect(chars.isMastered('好')).toBe(true);
    expect(words.isNew('好')).toBe(true);
    words.grade('好', 'good');
    const backup = chars.exportBackup();
    expect(JSON.parse(backup)).toMatchObject({ version: 4, words: { 好: { right: 1 } }, chars: { 好: { right: 4 } } });
    chars.clear();
    expect(words.isNew('好')).toBe(true);
    chars.importBackup(backup);
    expect(words.get('好')?.right).toBe(1);
    expect(chars.get('好')?.right).toBe(4);
  });

  it('schedules reviews and limits new words independently from characters', async () => {
    const { chars, words } = await stores();
    chars.grade('好', 'good');
    expect(words.daily.reviewed).toBe(0);
    words.introduce('word-0');
    expect(words.isNew('word-0')).toBe(false);
    expect(words.isDue('word-0')).toBe(false);
    expect(words.isDue('word-0', Date.now() + 86_400_001)).toBe(true);
    expect(words.buildQueue(Array.from({ length: 20 }, (_, i) => ({ id: `word-${i}` }))).fresh).toHaveLength(9);
    words.grade('word-0', 'again');
    expect(words.isDue('word-0')).toBe(true);
    expect(chars.daily.reviewed).toBe(1);
  });

  it('saves word sessions by id and rejects missing entries', async () => {
    const { saveVocabularySession, loadVocabularySession, hasStoredVocabularySession } = await import('../src/utils/vocabularySession');
    const entry = { id: 'hello', simplified: '你好', traditional: '你好', pinyin: 'nǐ hǎo', meaning: 'hello', level: 1 as const, characters: ['你', '好'], topicIds: [], sourceId: 'test' };
    expect(saveVocabularySession({ version: 1, deck: [{ entry, kind: 'learn' }], position: 0, revealed: true, step: 'seen', feedback: null, counts: { again: 0, hard: 0, good: 0 }, heading: 'Words' })).toBe(true);
    expect(loadVocabularySession([entry])?.deck[0].entry).toEqual(entry);
    expect(loadVocabularySession([])).toBeNull();
    expect(hasStoredVocabularySession()).toBe(false);
  });
  it('restores revealed and graded session state and preserves newer versions', async () => {
    const { saveVocabularySession, loadVocabularySession, hasStoredVocabularySession } = await import('../src/utils/vocabularySession');
    const entry = { id: 'hello', simplified: '你好', traditional: '你好', pinyin: 'nǐ hǎo', meaning: 'hello', level: 1 as const, characters: ['你', '好'], topicIds: [], sourceId: 'test' };
    const snapshot = { version: 1 as const, deck: [{ entry, kind: 'review' as const }], position: 0, revealed: true, step: 'check' as const, feedback: 'hard' as const, counts: { again: 1, hard: 2, good: 3 }, heading: 'Words' };
    expect(saveVocabularySession(snapshot)).toBe(true);
    expect(loadVocabularySession([entry])).toEqual(snapshot);
    const future = JSON.stringify({ version: 99, deck: [] });
    localStorage.setItem('jiayou-vocabulary-session-v1', future);
    expect(loadVocabularySession([entry])).toBeNull();
    expect(hasStoredVocabularySession()).toBe(true);
    expect(saveVocabularySession(snapshot)).toBe(false);
    expect(localStorage.getItem('jiayou-vocabulary-session-v1')).toBe(future);
  });

  it('rejects future backups without replacing either history', async () => {
    const { chars, words } = await stores();
    chars.grade('好', 'good');
    words.grade('hello', 'hard');
    const before = chars.exportBackup();
    expect(() => chars.importBackup(JSON.stringify({ version: 99, chars: {}, words: {} }))).toThrow();
    expect(chars.exportBackup()).toBe(before);
  });

});
