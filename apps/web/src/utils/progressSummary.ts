import { addLocalDays } from '@jiayou/learning/scheduler';
import type { ItemId, LocalDay } from '@jiayou/learning/types';
import type { ItemStatus, LearningStore } from '../stores/learningStore';

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
  nextDay: { date: number; count: number } | null;
  /** Not studied here yet but met elsewhere, e.g. a character known from a word. Counted in learning. */
  metElsewhere: number;
}

const endOfDay = (now: number, days: number) => {
  const end = new Date(now);
  end.setDate(end.getDate() + days);
  end.setHours(23, 59, 59, 999);
  return end.getTime();
};

/** Noon of a local day, so a weekday label never slips across midnight. */
const noonOf = (day: LocalDay) => new Date(`${day}T12:00:00`).getTime();

/**
 * The Home bar and the next-review line for these items, from the learning store. Weak items also
 * count as learning; a word taught today and waiting for its first rating counts for the day it
 * becomes eligible.
 */
export const summarizeLearning = (itemIds: readonly ItemId[], store: LearningStore, now = store.now()): ProgressSummary => {
  const endToday = endOfDay(now, 0);
  const endTomorrow = endOfDay(now, 1);
  const today = new Date(now).toLocaleDateString('sv-SE') as LocalDay;
  const tomorrowDay = addLocalDays(today, 1);
  const summary: ProgressSummary = { total: itemIds.length, fresh: 0, learning: 0, mastered: 0, weak: 0, laterToday: 0, tomorrow: 0, nextDay: null, metElsewhere: 0 };
  const later: number[] = [];
  for (const itemId of itemIds) {
    const status = store.status(itemId);
    if (status === 'new') {
      summary.fresh++;
      continue;
    }
    if (status === 'mastered') summary.mastered++;
    else summary.learning++;
    if (status === 'weak') summary.weak++;
    if (store.isPendingToday(itemId)) continue;
    const state = store.state(itemId);
    if (!state) continue;
    if (state.state === 'new') {
      if (state.eligibleFrom === tomorrowDay) summary.tomorrow++;
      else if (state.eligibleFrom !== null && state.eligibleFrom > tomorrowDay) later.push(noonOf(state.eligibleFrom));
      continue;
    }
    if (state.dueAt <= endToday) summary.laterToday++;
    else if (state.dueAt <= endTomorrow) summary.tomorrow++;
    else later.push(state.dueAt);
  }
  if (summary.laterToday === 0 && summary.tomorrow === 0 && later.length > 0) {
    const first = Math.min(...later);
    const end = endOfDay(first, 0);
    summary.nextDay = { date: first, count: later.filter((due) => due <= end).length };
  }
  return summary;
};

/** The three statuses Home and the word list show: weak and review words are still learning. */
export const studyStatusOf = (status: ItemStatus): 'new' | 'learning' | 'mastered' =>
  status === 'new' ? 'new' : status === 'mastered' ? 'mastered' : 'learning';

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/**
 * When the next reviews come, by the real date: "Más tarde hoy: 3 repasos", "Mañana: 18 repasos",
 * "El jueves: 4 repasos". Empty when nothing is scheduled.
 */
export const nextReviewsLabel = (summary: ProgressSummary, now = Date.now()): string => {
  const reviews = (n: number) => `${n} ${n === 1 ? 'repaso' : 'repasos'}`;
  if (summary.laterToday > 0) return `Más tarde hoy: ${reviews(summary.laterToday)}`;
  if (summary.tomorrow > 0) return `Mañana: ${reviews(summary.tomorrow)}`;
  if (!summary.nextDay) return '';
  const date = new Date(summary.nextDay.date);
  const inAWeek = summary.nextDay.date - now < 6 * 86_400_000;
  const when = inAWeek ? `El ${WEEKDAYS[date.getDay()]}` : `El ${date.getDate()}/${date.getMonth() + 1}`;
  return `${when}: ${reviews(summary.nextDay.count)}`;
};
