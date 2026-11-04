import { describe, expect, it } from 'vitest';
import { parseCheckpoint } from '../src/domain/progress/checkpoint';
import { createMemoryKeyValue } from '../src/persistence/keyValue';
import { createProgressState } from '../src/stores/progressState';
import { createProgressStore } from '../src/stores/progressStore';
import { createVocabularyProgressStore } from '../src/stores/vocabularyProgressStore';

const stores = () => {
  const doc = createProgressState(createMemoryKeyValue());
  return { chars: createProgressStore(doc), words: createVocabularyProgressStore(doc) };
};

describe('bounded session checkpoint', () => {
  it('restores the records the session touched and leaves one changed outside it intact', () => {
    const { chars, words } = stores();
    words.grade('word-a', 'good');
    words.grade('word-b', 'good');
    const before = words.get('word-a');
    const session = chars.checkpoint();
    words.grade('word-a', 'again');
    words.grade('word-new', 'good');
    // Another screen changes a record while the session is paused.
    chars.closeCheckpoint(session);
    words.grade('word-b', 'again');
    const outside = words.get('word-b');
    chars.resumeCheckpoint(session);
    chars.rollback(session);
    expect(words.get('word-a')).toEqual(before);
    expect(words.isNew('word-new')).toBe(true);
    expect(words.get('word-b')).toEqual(outside);
  });

  it('keeps only the touched records, so a paused session stays small', () => {
    const { chars, words } = stores();
    for (let i = 0; i < 50; i++) words.grade(`word-${i}`, 'good');
    const session = chars.checkpoint();
    words.grade('word-3', 'again');
    chars.grade('一', 'good');
    expect(Object.keys(session.words)).toEqual(['word-3']);
    expect(session.chars).toEqual({ 一: null });
  });

  it('survives a pause: a checkpoint read back from storage still undoes the session', () => {
    const { chars, words } = stores();
    const session = chars.checkpoint();
    words.grade('word-a', 'good');
    chars.closeCheckpoint(session);
    const resumed = chars.resumeCheckpoint(parseCheckpoint(JSON.parse(JSON.stringify(session))));
    words.grade('word-b', 'good');
    chars.rollback(resumed);
    expect(words.isNew('word-a')).toBe(true);
    expect(words.isNew('word-b')).toBe(true);
    expect(words.daily.reviewed).toBe(0);
    expect(chars.streak()).toBe(0);
  });

  it('rejects a checkpoint that is not valid', () => {
    expect(() => parseCheckpoint('{"version":3}')).toThrow();
    expect(() => parseCheckpoint({ daily: {}, wordDaily: {}, activity: {}, chars: {}, words: {} })).toThrow();
  });
});
