import { describe, expect, it } from 'vitest';
import { vocabulary } from './fixtures/levelWords';
import { readHomeSnapshot, rememberHomeSnapshot } from '../src/utils/homeSnapshot';
import { findPausedPractice, saveVocabularySession, type VocabularySessionSnapshot } from '../src/utils/vocabularySession';

const session = (heading: string): VocabularySessionSnapshot => ({
  version: 1,
  deck: [{ entry: vocabulary[0], kind: 'review' }],
  position: 0,
  revealed: false,
  step: 'ask',
  feedback: null,
  counts: { again: 0, hard: 0, good: 0 },
  heading,
  mode: 'practice',
});

describe('Home snapshot', () => {
  it('reads back what Home remembered for the same scope only', () => {
    rememberHomeSnapshot('vocabulary', 'hsk-1', { mastered: 3, learning: 5 });
    expect(localStorage.getItem('jiayou-home-last-vocabulary')).toBe(JSON.stringify({ scope: 'hsk-1', mastered: 3, learning: 5 }));
    expect(readHomeSnapshot('vocabulary', 'hsk-1')).toEqual({ mastered: 3, learning: 5 });
    expect(readHomeSnapshot('vocabulary', 'hsk-1,hsk-2')).toBeNull();
  });
});

describe('paused practice sessions', () => {
  it('finds the first one the caller accepts and skips unreadable ones', () => {
    localStorage.setItem('jiayou-vocabulary-session-v1:practice:__weak__', '{bad');
    saveVocabularySession(session('Una palabra'), 'word-1');
    saveVocabularySession(session('Flojas'), '__more__');
    const found = findPausedPractice(() => vocabulary, (id) => id.startsWith('__'));
    expect(found).toEqual({ id: '__more__', title: 'Flojas' });
    expect(localStorage.getItem('jiayou-vocabulary-session-v1:practice:__weak__')).toBeNull();
  });

  it('finds nothing when no session is paused', () => {
    expect(findPausedPractice(() => vocabulary, () => true)).toBeNull();
  });
});
