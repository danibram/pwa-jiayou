import { isWeakProgress, type CharProgress } from '../stores/progressStore';

export interface ProgressSummary {
  total: number;
  fresh: number;
  learning: number;
  mastered: number;
  /** Missed at some point and not yet answered Bien twice in a row since. */
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

interface ProgressReader {
  get(key: string): CharProgress | undefined;
  isNew(key: string): boolean;
  isDue(key: string, now?: number): boolean;
  isMastered(key: string): boolean;
}

const endOfDay = (now: number, days: number) => {
  const end = new Date(now);
  end.setDate(end.getDate() + days);
  end.setHours(23, 59, 59, 999);
  return end.getTime();
};

export const summarizeProgress = (
  keys: string[],
  store: ProgressReader,
  now = Date.now(),
  metElsewhere: (key: string) => boolean = () => false,
): ProgressSummary => {
  const endToday = endOfDay(now, 0);
  const endTomorrow = endOfDay(now, 1);
  const summary: ProgressSummary = { total: keys.length, fresh: 0, learning: 0, mastered: 0, weak: 0, laterToday: 0, tomorrow: 0, nextDay: null, metElsewhere: 0 };
  const later: number[] = [];
  for (const key of keys) {
    if (store.isNew(key)) {
      if (metElsewhere(key)) {
        summary.learning++;
        summary.metElsewhere++;
      } else summary.fresh++;
      continue;
    }
    if (store.isMastered(key)) summary.mastered++;
    else summary.learning++;
    const p = store.get(key);
    if (!p) continue;
    if (isWeakProgress(p)) summary.weak++;
    if (store.isDue(key, now)) continue;
    if (p.due <= endToday) summary.laterToday++;
    else if (p.due <= endTomorrow) summary.tomorrow++;
    else later.push(p.due);
  }
  if (summary.laterToday === 0 && summary.tomorrow === 0 && later.length > 0) {
    const first = Math.min(...later);
    const end = endOfDay(first, 0);
    summary.nextDay = { date: first, count: later.filter((due) => due <= end).length };
  }
  return summary;
};

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
