import { describe, expect, it } from 'vitest';
import { activityStreak, summarizeProgress } from '../../src/progress/index.ts';
import { createScheduler, DEFAULT_SCHEDULER_CONFIG } from '../../src/scheduler/index.ts';
import type { SchedulerState } from '../../src/types.ts';
import { at, utcRule, WORD } from '../scheduler/fixtures.ts';

describe('activityStreak', () => {
  it('counts days in a row up to today, or up to yesterday before today is practised', () => {
    expect(activityStreak({ '2026-03-29': 2, '2026-03-28': 1, '2026-03-27': 5 }, '2026-03-29')).toBe(3);
    expect(activityStreak({ '2026-03-28': 1, '2026-03-27': 5 }, '2026-03-29')).toBe(2);
    expect(activityStreak({ '2026-03-29': 1, '2026-03-27': 5 }, '2026-03-29')).toBe(1);
    expect(activityStreak({}, '2026-03-29')).toBe(0);
  });

  it('crosses the spring DST change by calendar days', () => {
    // Europe/Madrid moves to summer time on 2026-03-29; the streak counts labels, not hours.
    expect(activityStreak({ '2026-03-30': 1, '2026-03-29': 1, '2026-03-28': 1 }, '2026-03-30')).toBe(3);
  });
});

describe('summarizeProgress', () => {
  it('splits statuses and places the next reviews on local days', async () => {
    const scheduler = await createScheduler(DEFAULT_SCHEDULER_CONFIG);
    const rated = (dueAt: number, state: 'review' | 'learning' = 'review'): SchedulerState =>
      ({ ...scheduler.apply(scheduler.newState(WORD), 'good', at(0)), state, dueAt }) as SchedulerState;
    const now = at(10, 8);
    const items = [
      { status: 'new' as const, state: null },
      // A review due tonight is already today's work; a short step due tonight comes later today.
      { status: 'review' as const, state: rated(at(10, 20)) },
      { status: 'learning' as const, state: rated(at(10, 20), 'learning') },
      { status: 'weak' as const, state: rated(at(11, 9)) },
      { status: 'mastered' as const, state: rated(at(14, 9)) },
    ];
    expect(summarizeProgress(items, now, utcRule)).toMatchObject({ total: 5, fresh: 1, learning: 3, mastered: 1, weak: 1, laterToday: 1, tomorrow: 1, nextDay: null });
    const later = summarizeProgress(items.slice(4), now, utcRule);
    expect(later.nextDay).toEqual({ day: utcRule.localDay(at(14)), count: 1 });
  });
});
