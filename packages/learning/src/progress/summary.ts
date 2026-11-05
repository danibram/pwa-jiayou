import { addLocalDays, pendingToday, type LocalDayRule } from '../scheduler/index.ts';
import type { LocalDay, SchedulerState, Timestamp } from '../types.ts';
import type { ItemStatus } from './status.ts';

export interface ProgressSummary {
  total: number;
  fresh: number;
  learning: number;
  mastered: number;
  /** A scheduled Again in the last 30 days not yet followed by two passes. */
  weak: number;
  /** Comes due later today, not counting what is due now. */
  laterToday: number;
  /** Comes due tomorrow, by the calendar. */
  tomorrow: number;
  /** The first day after tomorrow with reviews, when nothing is due today or tomorrow. */
  nextDay: { day: LocalDay; count: number } | null;
  /** Not studied here yet but met elsewhere, e.g. a character known from a word. Counted in learning. */
  metElsewhere: number;
}

/**
 * The Home bar and the next-review line for these items. Weak items also count as learning; a word
 * taught today and waiting for its first rating counts for the day it becomes eligible. Days come
 * from `rule`, the same local day every other count uses.
 */
export const summarizeProgress = (
  items: readonly { status: ItemStatus; state: SchedulerState | null }[],
  now: Timestamp,
  rule: LocalDayRule,
): ProgressSummary => {
  const today = rule.localDay(now);
  const tomorrow = addLocalDays(today, 1);
  const summary: ProgressSummary = { total: items.length, fresh: 0, learning: 0, mastered: 0, weak: 0, laterToday: 0, tomorrow: 0, nextDay: null, metElsewhere: 0 };
  const later: LocalDay[] = [];
  for (const { status, state } of items) {
    if (status === 'new') {
      summary.fresh++;
      continue;
    }
    if (status === 'mastered') summary.mastered++;
    else summary.learning++;
    if (status === 'weak') summary.weak++;
    if (!state || pendingToday(state, now, rule)) continue;
    const day = state.state === 'new' ? state.eligibleFrom : rule.localDay(state.dueAt);
    if (day === null) continue;
    if (day <= today) summary.laterToday++;
    else if (day === tomorrow) summary.tomorrow++;
    else later.push(day);
  }
  if (summary.laterToday === 0 && summary.tomorrow === 0 && later.length > 0) {
    const first = later.reduce((a, b) => (b < a ? b : a));
    summary.nextDay = { day: first, count: later.filter((day) => day === first).length };
  }
  return summary;
};
