import { afterEach, describe, expect, it } from 'vitest';
import { deviceLocalDayRule } from '../src/domain/learning/scheduler';
import { activityStreak } from '../src/utils/activityStreak';
import { nextReviewsLabel, summarizeLearning, type ProgressSummary } from '../src/utils/progressSummary';
import { DAY, environment, finish, itemOf, POOL_WORDS, type Env } from './learning/stores/fixtures';

let env: Env | undefined;
afterEach(() => env?.closeAll());

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

});

describe('Home counts from the learning log', () => {
  it('counts taught words for tomorrow, then a missed review as weak', async () => {
    env = environment();
    const store = env.store({ dayRule: deviceLocalDayRule });
    const items = POOL_WORDS.map(itemOf);
    await finish(await env.session(store, { mode: 'today' }));
    const day0 = summarizeLearning(items, store);
    expect(day0).toMatchObject({ total: 12, fresh: 2, learning: 10, mastered: 0, weak: 0, tomorrow: 10 });
    expect(nextReviewsLabel(day0, store.now())).toBe('Mañana: 10 repasos');

    env.clock.advance(DAY);
    await finish(await env.session(store, { mode: 'today' }), (session) =>
      session.view.selection?.itemId === items[0] ? 'wrong' : 'right');
    const day1 = summarizeLearning(items, store);
    expect(day1.weak).toBe(1);
    expect(store.status(items[0])).toBe('weak');
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
});
