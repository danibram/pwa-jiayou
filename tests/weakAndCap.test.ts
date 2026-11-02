import { beforeEach, describe, expect, it } from 'vitest';
import { WORD_NEW_PER_DAY, parseProgress, progressStore, vocabularyProgressStore } from '../src/stores/progressStore';

beforeEach(() => { localStorage.clear(); progressStore.clear(); });

describe('weak items', () => {
  it('stay weak until two Bien in a row since the last miss', () => {
    vocabularyProgressStore.grade('w', 'again');
    expect(vocabularyProgressStore.isWeak('w')).toBe(true);
    vocabularyProgressStore.practice('w', 'good', false);
    expect(vocabularyProgressStore.isWeak('w')).toBe(true);
    vocabularyProgressStore.practice('w', 'again', false);
    vocabularyProgressStore.practice('w', 'good', false);
    vocabularyProgressStore.practice('w', 'good', false);
    expect(vocabularyProgressStore.isWeak('w')).toBe(false);
  });

  it('counts a character missed at first meeting', () => {
    progressStore.grade('一', 'again');
    expect(progressStore.isWeak('一')).toBe(true);
  });

  it('reads older saves without the counter from successful reviews', () => {
    const saved = parseProgress(JSON.stringify({ version: 3, chars: { 一: { right: 3, wrong: 1, reps: 2, interval: 3, due: 1 } }, daily: { day: '2026-01-01', reviewed: 0, introduced: 0, streak: 0 }, words: {}, wordDaily: { day: '2026-01-01', reviewed: 0, introduced: 0, streak: 0 } }));
    expect(saved.chars['一'].clean).toBe(2);
  });
});

describe('daily new-item cap', () => {
  it('shares one budget between the daily session and extra sessions', () => {
    const words = Array.from({ length: 40 }, (_, index) => ({ id: `w${index}` }));
    expect(vocabularyProgressStore.buildQueue(words).fresh).toHaveLength(10);
    for (const word of words.slice(0, 15)) vocabularyProgressStore.grade(word.id, 'good');
    expect(vocabularyProgressStore.newLeftToday()).toBe(WORD_NEW_PER_DAY - 15);
    expect(vocabularyProgressStore.buildQueue(words, 10).fresh).toHaveLength(5);
  });
});

describe('session checkpoint', () => {
  it('rolls back grades, daily counts and the streak', () => {
    const before = progressStore.checkpoint();
    progressStore.grade('一', 'good');
    vocabularyProgressStore.grade('w', 'again');
    progressStore.rollback(before);
    expect(progressStore.isNew('一')).toBe(true);
    expect(vocabularyProgressStore.isNew('w')).toBe(true);
    expect(progressStore.daily.reviewed).toBe(0);
    expect(progressStore.daily.streak).toBe(0);
  });
});

describe('activity calendar', () => {
  it('counts answers from both kinds of session on today', () => {
    progressStore.grade('一', 'good');
    vocabularyProgressStore.grade('w', 'good');
    const day = new Date().toLocaleDateString('sv-SE');
    expect(progressStore.activity()[day]).toBe(2);
  });

  it('reads saves without a calendar', () => {
    const saved = parseProgress(JSON.stringify({ version: 3, chars: {}, daily: { day: '2026-01-01', reviewed: 0, introduced: 0, streak: 0 }, words: {}, wordDaily: { day: '2026-01-01', reviewed: 0, introduced: 0, streak: 0 } }));
    expect(saved.activity).toEqual({});
  });
});

describe('flojos session recovery', () => {
  it('takes a weak word off the list with one Bien', () => {
    vocabularyProgressStore.grade('w', 'again');
    expect(vocabularyProgressStore.recoverWeak('w')).toBe(true);
    expect(vocabularyProgressStore.isWeak('w')).toBe(false);
    expect(vocabularyProgressStore.recoverWeak('w')).toBe(false);
  });

  it('takes a weak character off the list with one Bien', () => {
    progressStore.grade('一', 'again');
    expect(progressStore.recoverWeak('一')).toBe(true);
    expect(progressStore.isWeak('一')).toBe(false);
  });
});

describe('return note', () => {
  it('never says more come back than were missed, and names retries passed', async () => {
    const { returnNoteText } = await import('../src/components/ScoreModal');
    expect(returnNoteText(3, 5, 'palabra')).toBe('3 palabras falladas vuelven hoy.');
    expect(returnNoteText(3, 1, 'palabra')).toBe('1 palabra fallada vuelve hoy. 2 palabras que fallaste y luego acertaste vuelven mañana.');
    expect(returnNoteText(1, 0, 'carácter')).toBe('1 carácter que fallaste y luego acertaste vuelve mañana.');
    expect(returnNoteText(0, 0, 'palabra')).toBe('A partir de mañana, según lo bien que te lo sabías.');
  });
});
