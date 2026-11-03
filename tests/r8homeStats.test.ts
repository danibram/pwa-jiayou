import { beforeEach, describe, expect, it } from 'vitest';
import { activityStreak, progressStore } from '../src/stores/progressStore';
import { vocabularyProgressStore } from '../src/stores/vocabularyProgressStore';
import { nextReviewsLabel, summarizeProgress, type ProgressSummary } from '../src/utils/progressSummary';

const day = (offset: number) => {
  const date = new Date(2026, 10, 2, 12);
  date.setDate(date.getDate() + offset);
  return date.toLocaleDateString('sv-SE');
};

describe('the streak', () => {
  const now = new Date(2026, 10, 2, 18);

  it('counts calendar days, not sessions', () => {
    expect(activityStreak({ [day(0)]: 40 }, now)).toBe(1);
    expect(activityStreak({ [day(0)]: 3, [day(-1)]: 9, [day(-2)]: 1 }, now)).toBe(3);
  });

  it('keeps yesterday\'s streak until today is practised, and breaks on a gap', () => {
    expect(activityStreak({ [day(-1)]: 5, [day(-2)]: 5 }, now)).toBe(2);
    expect(activityStreak({ [day(0)]: 5, [day(-2)]: 5 }, now)).toBe(1);
  });

  it('is one on day one after a word session and a character session', () => {
    progressStore.clear();
    vocabularyProgressStore.introduce('w1');
    vocabularyProgressStore.grade('w1', 'good');
    progressStore.introduce('一', { free: true });
    progressStore.grade('二', 'good', { free: true });
    expect(progressStore.daily.streak).toBe(1);
    expect(vocabularyProgressStore.daily.streak).toBe(1);
  });
});

describe('a word missed before its first graded answer', () => {
  beforeEach(() => progressStore.clear());

  it('shows as flojo on Home even when its recall is right', () => {
    vocabularyProgressStore.practice('w2', 'again', false);
    vocabularyProgressStore.grade('w2', 'good');
    expect(vocabularyProgressStore.isWeak('w2')).toBe(true);
    expect(summarizeProgress(['w2'], vocabularyProgressStore).weak).toBe(1);
  });

  it('leaves no trace after a discard', () => {
    const checkpoint = progressStore.checkpoint();
    vocabularyProgressStore.practice('w3', 'again', false);
    progressStore.rollback(checkpoint);
    vocabularyProgressStore.grade('w3', 'good');
    expect(vocabularyProgressStore.isWeak('w3')).toBe(false);
  });
});

describe('when the next reviews come', () => {
  const base: ProgressSummary = { total: 0, fresh: 0, learning: 0, mastered: 0, weak: 0, laterToday: 0, tomorrow: 0, nextDay: null, metElsewhere: 0 };

  it('names later today, tomorrow or the weekday', () => {
    expect(nextReviewsLabel({ ...base, laterToday: 3, tomorrow: 5 })).toBe('Más tarde hoy: 3 repasos');
    expect(nextReviewsLabel({ ...base, tomorrow: 1 })).toBe('Mañana: 1 repaso');
    const now = new Date(2026, 10, 2, 9).getTime();
    const thursday = new Date(2026, 10, 5, 9).getTime();
    expect(nextReviewsLabel({ ...base, nextDay: { date: thursday, count: 4 } }, now)).toBe('El jueves: 4 repasos');
    expect(nextReviewsLabel(base)).toBe('');
  });

  it('counts a card due this evening as today, not tomorrow', () => {
    progressStore.clear();
    vocabularyProgressStore.introduce('w4');
    const p = vocabularyProgressStore.get('w4')!;
    const evening = new Date(p.due);
    const now = new Date(evening.getFullYear(), evening.getMonth(), evening.getDate(), 0, 30).getTime();
    const summary = summarizeProgress(['w4'], vocabularyProgressStore, now);
    expect(summary.laterToday).toBe(1);
    expect(summary.tomorrow).toBe(0);
  });
});
