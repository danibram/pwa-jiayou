import type { CharProgress, Grade } from './types';

const DAY_MS = 86_400_000;
/** Bien answers in a row after this one. A Difícil keeps the run, an Otra vez ends it. */
export const afterAnswer = (clean: number, grade: Grade) => grade === 'again' ? 0 : grade === 'good' ? clean + 1 : clean;

export const schedule = (p: CharProgress, grade: Grade, now: number): CharProgress => {
  if (grade === 'again') {
    return {
      ...p,
      wrong: p.wrong + 1,
      reps: 0,
      lapses: p.reps > 0 || p.interval > 0 ? p.lapses + 1 : p.lapses,
      clean: 0,
      interval: 0,
      ease: Math.max(1.3, p.ease - 0.2),
      due: now,
    };
  }
  const interval =
    grade === 'hard'
      ? Math.max(1, Math.round(p.interval * 1.2))
      : p.reps === 0
        ? 1
        : p.reps === 1
          ? 3
          : Math.round(p.interval * p.ease);
  return {
    ...p,
    right: p.right + 1,
    reps: p.reps + 1,
    clean: afterAnswer(p.clean, grade),
    interval,
    ease: grade === 'hard' ? Math.max(1.3, p.ease - 0.15) : p.ease,
    due: now + interval * DAY_MS,
  };
};

