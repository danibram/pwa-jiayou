import { summarizeProgress, type ProgressSummary } from '@jiayou/learning/progress';
import type { ItemId } from '@jiayou/learning/types';
import type { LearningStore } from '../stores/learningStore';

export type { ProgressSummary } from '@jiayou/learning/progress';

/** `summarizeProgress` over these items as the learning store holds them. */
export const summarizeLearning = (itemIds: readonly ItemId[], store: LearningStore, now = store.now()): ProgressSummary =>
  summarizeProgress(itemIds.map((itemId) => ({ status: store.status(itemId), state: store.state(itemId) })), now, store.dayRule());

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
  // Noon of the day, so the weekday never slips across midnight.
  const date = new Date(`${summary.nextDay.day}T12:00:00`);
  const inAWeek = date.getTime() - now < 6 * 86_400_000;
  const when = inAWeek ? `El ${WEEKDAYS[date.getDay()]}` : `El ${date.getDate()}/${date.getMonth() + 1}`;
  return `${when}: ${reviews(summary.nextDay.count)}`;
};
