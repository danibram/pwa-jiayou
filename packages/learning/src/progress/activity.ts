import { addLocalDays, liveEvents } from '../scheduler/index.ts';
import type { LearningEvent, LocalDay } from '../types.ts';

/** Exposures and answers per local day, voided ones left out: the activity calendar's log. */
export const activityByDay = (events: readonly LearningEvent[]): Record<LocalDay, number> => {
  const days: Record<LocalDay, number> = {};
  for (const event of liveEvents(events)) days[event.localDay] = (days[event.localDay] ?? 0) + 1;
  return days;
};

/**
 * Days in a row with any practice, words or characters, ending today, or yesterday when today has
 * none yet. It reads the calendar's log, so the streak and the calendar always agree.
 */
export const activityStreak = (activity: Readonly<Record<string, number>>, today: LocalDay): number => {
  const active = (day: LocalDay) => (activity[day] ?? 0) > 0;
  let day = active(today) ? today : addLocalDays(today, -1);
  let streak = 0;
  while (active(day)) {
    streak++;
    day = addLocalDays(day, -1);
  }
  return streak;
};
