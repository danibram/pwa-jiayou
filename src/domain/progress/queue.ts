import type { CharProgress, DailyLog } from './types';

const DAY_MS = 86_400_000;
export const MASTERED_INTERVAL = 21;
export const NEW_PER_DAY = 10;
/** New characters a day, shared by every way into a session. Each one is watched, traced and written. */
export const CHAR_NEW_PER_DAY = 8;
/** Characters already known from words, checked at the start of a session. They do not spend the cap. */
export const KNOWN_PER_SESSION = 10;
export const WORD_NEW_PER_DAY = 20;
/**
 * Bien answers in a row that take an item off the weak list in ordinary sessions.
 * A Bien inside a Flojos session is enough on its own: that session exists to clear them.
 */
export const CLEAN_TO_RECOVER = 2;
export const SESSION_SIZE = 20;

/** The learner's local calendar day, as "2026-11-01". */
export const dayKey = (now = Date.now()) => new Date(now).toLocaleDateString('sv-SE');

export const emptyDaily = (now = Date.now()): DailyLog => ({ day: dayKey(now), reviewed: 0, introduced: 0, streak: 0 });

/** Rolls the daily log over to today, keeping the streak if yesterday was active. */
export const currentDaily = (d: DailyLog, now = Date.now()): DailyLog => {
  if (d.day === dayKey(now)) return d;
  return {
    day: dayKey(now),
    reviewed: 0,
    introduced: 0,
    streak: d.day === dayKey(now - DAY_MS) && (d.reviewed > 0 || d.introduced > 0) ? d.streak : 0,
  };
};

/** New items `cap` still allows today. */
export const newLeftToday = (cap: number, daily: DailyLog, now = Date.now()): number =>
  Math.max(0, cap - currentDaily(daily, now).introduced);

/**
 * Days in a row with any practice, words or characters, ending today, or yesterday when today has
 * none yet. It reads the calendar's log, so the streak and the calendar always agree.
 */
export const activityStreak = (activity: Record<string, number>, now = new Date()): number => {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const active = (d: Date) => (activity[d.toLocaleDateString('sv-SE')] ?? 0) > 0;
  if (!active(day)) day.setDate(day.getDate() - 1);
  let streak = 0;
  while (active(day)) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  return streak;
};

/** A first look sets a due date and still has no answers, so it is no longer new. */
export const isNewProgress = (p: CharProgress | undefined): boolean =>
  !p || (p.right + p.wrong === 0 && p.due === 0);

export const isDueProgress = (p: CharProgress | undefined, now = Date.now()): boolean =>
  !!p && !isNewProgress(p) && p.due <= now;

/** Missed at some point and not yet answered Bien twice in a row since. */
export const isWeakProgress = (p: CharProgress | undefined): boolean =>
  !!p && p.wrong > 0 && p.clean < CLEAN_TO_RECOVER && p.interval < MASTERED_INTERVAL;

/**
 * Today's character session: due cards first (most overdue first), then unseen ones in frequency order.
 * A character missed earlier today is not due again today: the session already asked it twice.
 */
export const buildCharQueue = <T extends { character: string }>(
  chars: T[],
  progress: Record<string, CharProgress>,
  daily: DailyLog,
  extraNew = 0,
  /** Unseen characters the learner already met in a word. They go in `known`, outside the cap. */
  prefer: (char: string) => boolean = () => false,
  now = Date.now(),
): { due: T[]; fresh: T[]; known: T[] } => {
  const startOfDay = new Date(now).setHours(0, 0, 0, 0);
  const due = chars
    .filter((c) => isDueProgress(progress[c.character], now) && !(progress[c.character].interval === 0 && progress[c.character].due >= startOfDay))
    .sort((a, b) => progress[a.character].due - progress[b.character].due)
    .slice(0, SESSION_SIZE);
  const left = newLeftToday(CHAR_NEW_PER_DAY, daily, now);
  const unseen = chars.filter((c) => isNewProgress(progress[c.character]));
  const known = unseen.filter((c) => prefer(c.character)).slice(0, KNOWN_PER_SESSION);
  const budget = extraNew ? Math.min(extraNew, left) : Math.max(0, Math.min(left, SESSION_SIZE - due.length));
  const fresh = unseen.filter((c) => !prefer(c.character)).slice(0, budget);
  return { due, fresh, known };
};

/** Today's word session: due words first (most overdue first), then new ones in list order. */
export const buildWordQueue = <T extends { id: string }>(
  entries: T[],
  progress: Record<string, CharProgress>,
  daily: DailyLog,
  extraNew = 0,
  now = Date.now(),
): { due: T[]; fresh: T[] } => {
  const due = entries
    .filter((entry) => isDueProgress(progress[entry.id], now))
    .sort((a, b) => progress[a.id].due - progress[b.id].due)
    .slice(0, SESSION_SIZE);
  // The daily session teaches ten. "Aprender más" reaches the rest of the cap.
  const introduced = currentDaily(daily, now).introduced;
  const left = newLeftToday(WORD_NEW_PER_DAY, daily, now);
  const budget = extraNew ? Math.min(extraNew, left) : Math.max(0, Math.min(NEW_PER_DAY - introduced, left, SESSION_SIZE - due.length));
  return { due, fresh: entries.filter((entry) => isNewProgress(progress[entry.id])).slice(0, budget) };
};
