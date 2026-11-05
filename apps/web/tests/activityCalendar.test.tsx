import { render } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import ActivityCalendar from '../src/components/ActivityCalendar';
import { activityStreak } from '@jiayou/learning/progress';

// Sunday 1 November 2026, noon.
const today = new Date(2026, 10, 1, 12);

/** A learner's day log: a four-day streak and older gaps. */
const sample = {
  '2026-09-14': 12,
  '2026-10-05': 3,
  '2026-10-20': 40,
  '2026-10-21': 1,
  '2026-10-29': 8,
  '2026-10-30': 22,
  '2026-10-31': 5,
  '2026-11-01': 17,
};

describe('activity calendar and streak', () => {
  it('count the same days', () => {
    expect(activityStreak(sample, '2026-11-01')).toBe(4);
    const view = render(() => <ActivityCalendar activity={sample} today={today} />);
    expect(view.getByText('Esta semana has practicado 4 días')).toBeTruthy();
  });

  it('count nothing for an empty log', () => {
    expect(activityStreak({}, '2026-11-01')).toBe(0);
  });
});
