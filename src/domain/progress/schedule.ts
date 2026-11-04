import type { Grade } from '../../stores/progressStore';
import type { CharProgress } from './types';

export const DAY_MS = 86_400_000;
const MIN_EASE = 1.3;
const MAX_EASE = 2.5;
/** What a Bien gives back, so a word that recovers is not stuck with the ease of its bad week. */
const EASE_GAIN = 0.05;
const afterAnswer = (clean: number, grade: Grade) => grade === 'again' ? 0 : grade === 'good' ? clean + 1 : clean;

export interface ScheduleOptions {
  /**
   * The item was already graded earlier today, so this is a retry inside a session.
   * It reschedules the item but leaves the ease alone: one bad morning costs one step, not three.
   */
  sameDay?: boolean;
}

/** Midnight at the end of the local day that holds `now`. Anything due before it is due today. */
export const endOfDay = (now: number): number => {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
};

/** Midnight at the start of the local day that holds `now`. */
export const startOfDay = (now: number): number => new Date(now).setHours(0, 0, 0, 0);

export const schedule = (p: CharProgress, grade: Grade, now: number, options: ScheduleOptions = {}): CharProgress => {
  const sameDay = options.sameDay ?? false;
  if (grade === 'again') {
    return {
      ...p,
      wrong: p.wrong + 1,
      reps: 0,
      lapses: p.reps > 0 || p.interval > 0 ? p.lapses + 1 : p.lapses,
      clean: 0,
      interval: 0,
      ease: sameDay ? p.ease : Math.max(MIN_EASE, p.ease - 0.2),
      due: now,
      lastReview: now,
    };
  }
  // Days the item actually survived. Older saves have no review date; their interval stands in.
  const elapsed = p.lastReview ? Math.max(0, Math.floor((now - p.lastReview) / DAY_MS)) : p.interval;
  const early = elapsed < p.interval;
  let interval: number;
  if (grade === 'hard') {
    interval = Math.max(1, Math.round(p.interval * 1.2));
  } else if (p.reps === 0) {
    interval = 1;
  } else if (p.reps === 1) {
    interval = Math.max(3, p.interval);
  } else if (early) {
    // Asked before its date (Repasar todo, Flojos): it grows from the days it really waited and never shrinks.
    interval = Math.max(p.interval, Math.round(Math.max(1, elapsed) * p.ease));
  } else {
    // A late answer proves more than the planned interval; a Bien always moves the item at least a day on.
    interval = Math.max(p.interval + 1, Math.round(Math.max(p.interval, elapsed) * p.ease));
  }
  const ease = sameDay
    ? p.ease
    : grade === 'hard'
      ? Math.max(MIN_EASE, p.ease - 0.15)
      : Math.min(MAX_EASE, p.ease + EASE_GAIN);
  return {
    ...p,
    right: p.right + 1,
    reps: p.reps + 1,
    clean: afterAnswer(p.clean, grade),
    interval,
    ease,
    due: now + interval * DAY_MS,
    lastReview: now,
  };
};
