import { beforeAll, describe, expect, it } from 'vitest';
import {
  addLocalDays,
  createScheduler,
  DEFAULT_SCHEDULER_CONFIG,
  deviceLocalDayRule,
  isDue,
  isMastered,
  isWeak,
  pendingToday,
  tomorrowLoad,
  tomorrowLoadFull,
  type ReviewedSchedulerState,
  type Scheduler,
} from '../../../src/domain/learning/scheduler';
import { STUDY_RULES, type LearningEvent, type LocalDay, type Rating, type SchedulerState } from '../../../src/domain/learning/types';
import { at, DAY, practice, review, utcRule, voided, WORD } from './fixtures';

let scheduler: Scheduler;
beforeAll(async () => {
  scheduler = await createScheduler(DEFAULT_SCHEDULER_CONFIG);
});

const reviewed = (change: Partial<ReviewedSchedulerState>): SchedulerState => ({
  ...scheduler.apply(scheduler.newState(WORD), 'good', at(0)),
  ...change,
});
const newWord = (eligibleFrom: LocalDay | null): SchedulerState => ({ ...scheduler.newState(WORD), eligibleFrom });

describe('local days', () => {
  it('adds calendar days without a time zone', () => {
    expect(addLocalDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addLocalDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addLocalDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addLocalDays('2026-11-05', -29)).toBe('2026-10-07');
    expect(() => addLocalDays('5/11/2026' as LocalDay, 1)).toThrow('Invalid local day');
  });

  it('follows dayKey and endOfDay on the device', () => {
    const now = new Date(2026, 10, 5, 15, 30).getTime();
    expect(deviceLocalDayRule.localDay(now)).toBe('2026-11-05');
    expect(deviceLocalDayRule.nextLocalMidnight(now)).toBe(new Date(2026, 10, 6).getTime());
  });
});

describe('isDue and pendingToday', () => {
  const noon = at(10, 12);

  it('takes a review card due before the next local midnight', () => {
    const lateToday = reviewed({ state: 'review', dueAt: at(10, 23) });
    expect(pendingToday(lateToday, noon, utcRule)).toBe(true);
    expect(isDue(lateToday, noon)).toBe(false);
    expect(pendingToday(reviewed({ state: 'review', dueAt: at(11) }), noon, utcRule)).toBe(false);
  });

  it('keeps the hour of a learning or relearning step', () => {
    for (const state of ['learning', 'relearning'] as const) {
      expect(pendingToday(reviewed({ state, dueAt: noon + 60_000 }), noon, utcRule)).toBe(false);
      expect(pendingToday(reviewed({ state, dueAt: noon }), noon, utcRule)).toBe(true);
      expect(isDue(reviewed({ state, dueAt: noon }), noon)).toBe(true);
    }
  });

  it('takes a new word from its eligible day', () => {
    expect(pendingToday(newWord(null), noon, utcRule)).toBe(false);
    expect(pendingToday(newWord('2026-01-12'), noon, utcRule)).toBe(false);
    expect(pendingToday(newWord('2026-01-11'), noon, utcRule)).toBe(true);
    expect(pendingToday(newWord('2026-01-02'), noon, utcRule)).toBe(true);
    expect(isDue(newWord('2026-01-02'), noon)).toBe(false);
  });
});

describe('isWeak', () => {
  const today: LocalDay = '2026-02-01';
  const reviews = (ratings: readonly Rating[], firstDay = 20) =>
    ratings.map((rating, index) => review({ id: `r${index}`, occurredAt: at(firstDay + index), rating, configId: scheduler.configId }));
  const weak = (events: readonly LearningEvent[]) => isWeak(events, WORD, today);

  it('marks a recent Again until two other scheduled ratings follow', () => {
    expect(weak(reviews(['good']))).toBe(false);
    expect(weak(reviews(['good', 'again']))).toBe(true);
    expect(weak(reviews(['again', 'good']))).toBe(true);
    expect(weak(reviews(['again', 'hard', 'good']))).toBe(false);
    expect(weak(reviews(['again', 'good', 'again', 'easy']))).toBe(true);
  });

  it('forgets an Again older than 30 local days', () => {
    // at(d) falls on 2026-01-(d+1); today is 2026-02-01, so the window opens on 2026-01-03.
    expect(weak(reviews(['again'], 2))).toBe(true);
    expect(weak(reviews(['again'], 1))).toBe(false);
    expect(addLocalDays(today, 1 - STUDY_RULES.weakWindowDays)).toBe('2026-01-03');
  });

  it('ignores practice and voided reviews', () => {
    const missed = reviews(['again']);
    const practised = [...missed, practice({ id: 'p0', occurredAt: at(22) }), practice({ id: 'p1', occurredAt: at(23) })];
    expect(weak(practised)).toBe(true);
    expect(weak([...missed, voided({ id: 'v', occurredAt: at(22), targetEventId: 'r0' })])).toBe(false);
  });
});

describe('isMastered', () => {
  it('needs 21 days of stability', () => {
    expect(isMastered(newWord('2026-01-02'))).toBe(false);
    expect(isMastered(reviewed({ stability: 20.99 }))).toBe(false);
    expect(isMastered(reviewed({ stability: 21 }))).toBe(true);
  });
});

describe('tomorrowLoad', () => {
  it('counts items falling due in the next 24 hours, not overdue or new ones', () => {
    const now = at(10);
    const states = [
      reviewed({ dueAt: now - 1 }),
      reviewed({ dueAt: now }),
      reviewed({ dueAt: now + DAY - 1 }),
      reviewed({ dueAt: now + DAY }),
      newWord('2026-01-01'),
    ];
    expect(tomorrowLoad(states, now)).toBe(2);
  });

  it('is full at the limit', () => {
    const now = at(10);
    const states = Array.from({ length: STUDY_RULES.tomorrowLoadLimit }, () => reviewed({ dueAt: now + 1 }));
    expect(tomorrowLoadFull(states.slice(1), now)).toBe(false);
    expect(tomorrowLoadFull(states, now)).toBe(true);
  });
});
