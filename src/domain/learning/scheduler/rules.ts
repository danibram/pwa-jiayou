import { STUDY_RULES, type ItemId, type LearningEvent, type LocalDay, type SchedulerState, type Timestamp } from '../types';
import type { LocalDayRule } from './localDay';
import { addLocalDays } from './localDay';
import { effectiveItemEvents } from './rebuild';

/** The absolute due check: the instant has come. A new item is never due by this test. */
export const isDue = (state: SchedulerState, now: Timestamp): boolean => state.state !== 'new' && state.dueAt <= now;

/**
 * Whether Hoy shows the item as pending, which is also whether a `meaning` card may write a
 * `scheduled-review` with `basis: 'due'` ("Inicio del día" in contracts.md):
 * - review: due before the next local midnight and last rated on an earlier local day, so a day that
 *   lasts 25 hours (autumn DST) cannot rate it twice when a one-day interval ends before its midnight;
 * - learning and relearning: due now, since short steps keep their time;
 * - new: `eligibleFrom` has arrived.
 */
export const pendingToday = (state: SchedulerState, now: Timestamp, rule: LocalDayRule): boolean => {
  switch (state.state) {
    case 'new':
      return state.eligibleFrom !== null && state.eligibleFrom <= rule.localDay(now);
    case 'review':
      return state.dueAt < rule.nextLocalMidnight(now) && rule.localDay(state.lastReviewAt) < rule.localDay(now);
    default:
      return state.dueAt <= now;
  }
};

/**
 * A scheduled Again whose local day is today or one of the 29 before it, not yet followed by two
 * scheduled reviews in a row other than Again. Practice, Flojos included, never changes it.
 */
export const isWeak = (events: readonly LearningEvent[], itemId: ItemId, today: LocalDay): boolean => {
  const reviews = effectiveItemEvents(events, itemId).filter((event) => event.type === 'scheduled-review');
  let lastMiss = reviews.length - 1;
  while (lastMiss >= 0 && reviews[lastMiss].rating !== 'again') lastMiss -= 1;
  if (lastMiss < 0) return false;
  const windowStart = addLocalDays(today, 1 - STUDY_RULES.weakWindowDays);
  if (reviews[lastMiss].localDay < windowStart) return false;
  return reviews.length - lastMiss - 1 < STUDY_RULES.weakRecoveryStreak;
};

export const isMastered = (state: SchedulerState): boolean =>
  state.state !== 'new' && state.stability >= STUDY_RULES.masteredStabilityDays;

/**
 * Tomorrow's load: rated items falling due from now to 24 hours later, plus new items whose first
 * rating opens tomorrow (taught and practised today). Items already overdue, and new items already
 * eligible, are today's work and do not count. The previous system counted to the end of tomorrow.
 */
export const tomorrowLoad = (states: Iterable<SchedulerState>, now: Timestamp, rule: LocalDayRule): number => {
  const end = now + STUDY_RULES.tomorrowWindowMs;
  const tomorrow = addLocalDays(rule.localDay(now), 1);
  let load = 0;
  for (const state of states) {
    if (state.state === 'new' ? state.eligibleFrom === tomorrow : state.dueAt >= now && state.dueAt < end) load += 1;
  }
  return load;
};

/**
 * What Hoy will hold tomorrow if nothing more is studied today: items pending at the last instant
 * of the next local day, today's leftovers included. The session summary's "Mañana" reads it, so
 * the figure does not move as the day goes on, unlike the rolling window of `tomorrowLoad`.
 */
export const pendingTomorrow = (states: Iterable<SchedulerState>, now: Timestamp, rule: LocalDayRule): number => {
  const endOfTomorrow = rule.nextLocalMidnight(rule.nextLocalMidnight(now)) - 1;
  let count = 0;
  for (const state of states) if (pendingToday(state, endOfTomorrow, rule)) count += 1;
  return count;
};

/** New words wait while tomorrow's load reaches the limit. */
export const tomorrowLoadFull = (states: Iterable<SchedulerState>, now: Timestamp, rule: LocalDayRule): boolean =>
  tomorrowLoad(states, now, rule) >= STUDY_RULES.tomorrowLoadLimit;
