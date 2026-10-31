import { createStore } from 'solid-js/store';

export type Grade = 'again' | 'hard' | 'good';

/** Per-character learning history, kept across sessions. */
export interface CharProgress {
  right: number;
  wrong: number;
  /** Successful reviews since the last lapse. */
  reps: number;
  lapses: number;
  /** Days until the next review. */
  interval: number;
  ease: number;
  /** Epoch ms when the character is due again. */
  due: number;
  strokeRuns: number;
  /** Fewest mistakes in a completed stroke practice. */
  strokeBest: number | null;
  lastSeen: number;
}

interface DailyLog {
  day: string;
  reviewed: number;
  introduced: number;
  /** Consecutive days with at least one review, including `day`. */
  streak: number;
}

interface ProgressState {
  chars: Record<string, CharProgress>;
  daily: DailyLog;
}

const STORAGE_KEY = 'hsk-flashcards-stats';
const DAY_MS = 86_400_000;
const MASTERED_INTERVAL = 21;
export const DAILY_GOAL = 20;
export const NEW_PER_DAY = 10;
export const SESSION_SIZE = 20;

const today = () => new Date().toLocaleDateString('sv-SE');
const yesterday = () => new Date(Date.now() - DAY_MS).toLocaleDateString('sv-SE');

const emptyDaily = (): DailyLog => ({ day: today(), reviewed: 0, introduced: 0, streak: 0 });

const empty = (): CharProgress => ({
  right: 0,
  wrong: 0,
  reps: 0,
  lapses: 0,
  interval: 0,
  ease: 2.5,
  due: 0,
  strokeRuns: 0,
  strokeBest: null,
  lastSeen: 0,
});

const load = (): ProgressState => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!saved) return { chars: {}, daily: emptyDaily() };
    // Version 1 stored the character map at the top level.
    const chars: Record<string, Partial<CharProgress>> = saved.chars ?? saved;
    const migrated: Record<string, CharProgress> = {};
    for (const [char, p] of Object.entries(chars)) {
      if (char === 'daily') continue;
      migrated[char] = { ...empty(), ...p };
    }
    return { chars: migrated, daily: saved.daily ?? emptyDaily() };
  } catch {
    return { chars: {}, daily: emptyDaily() };
  }
};

const [state, setState] = createStore<ProgressState>(load());

const save = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be full or blocked; progress is a convenience, not critical.
  }
};

const update = (char: string, fn: (p: CharProgress) => CharProgress) => {
  setState('chars', char, fn(state.chars[char] ?? empty()));
};

/** Rolls the daily log over to today, keeping the streak if yesterday was active. */
const currentDaily = (): DailyLog => {
  const d = state.daily;
  if (d.day === today()) return d;
  return {
    day: today(),
    reviewed: 0,
    introduced: 0,
    streak: d.day === yesterday() && d.reviewed > 0 ? d.streak : 0,
  };
};

const schedule = (p: CharProgress, grade: Grade, now: number): CharProgress => {
  if (grade === 'again') {
    return {
      ...p,
      wrong: p.wrong + 1,
      reps: 0,
      lapses: p.reps > 0 || p.interval > 0 ? p.lapses + 1 : p.lapses,
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
    interval,
    ease: grade === 'hard' ? Math.max(1.3, p.ease - 0.15) : p.ease,
    due: now + interval * DAY_MS,
  };
};

export const progressStore = {
  get(char: string): CharProgress | undefined {
    return state.chars[char];
  },

  grade(char: string, grade: Grade) {
    const now = Date.now();
    const isNew = !state.chars[char] || state.chars[char].right + state.chars[char].wrong === 0;
    update(char, (p) => ({ ...schedule(p, grade, now), lastSeen: now }));
    const daily = currentDaily();
    setState('daily', {
      ...daily,
      reviewed: daily.reviewed + 1,
      introduced: daily.introduced + (isNew ? 1 : 0),
      streak: daily.reviewed === 0 ? daily.streak + 1 : daily.streak,
    });
    save();
  },

  /**
   * A first look. The character comes back tomorrow as a real question.
   * It does not count as a right or a wrong answer.
   */
  introduce(char: string) {
    if (!this.isNew(char)) return;
    const now = Date.now();
    update(char, (p) => ({
      ...p,
      interval: 1,
      due: now + DAY_MS,
      lastSeen: now,
    }));
    const daily = currentDaily();
    setState('daily', { ...daily, introduced: daily.introduced + 1 });
    save();
  },

  /** Free practice: counts the answer but leaves the schedule alone, so cramming can't inflate intervals. */
  practice(char: string, correct: boolean) {
    if (this.isDue(char)) return this.grade(char, correct ? 'good' : 'again');
    if (this.isNew(char)) return;
    update(char, (p) => ({
      ...p,
      right: p.right + (correct ? 1 : 0),
      wrong: p.wrong + (correct ? 0 : 1),
      lastSeen: Date.now(),
    }));
    save();
  },

  /** Shorthand for a binary right/wrong answer. */
  recordReview(char: string, correct: boolean) {
    this.grade(char, correct ? 'good' : 'again');
  },

  recordStrokes(char: string, mistakes: number) {
    update(char, (p) => ({
      ...p,
      strokeRuns: p.strokeRuns + 1,
      strokeBest: p.strokeBest === null ? mistakes : Math.min(p.strokeBest, mistakes),
      lastSeen: Date.now(),
    }));
    save();
  },

  isNew(char: string): boolean {
    const p = state.chars[char];
    // A first look sets a due date and still has no answers, so it is no longer new.
    return !p || (p.right + p.wrong === 0 && p.due === 0);
  },

  isDue(char: string, now = Date.now()): boolean {
    const p = state.chars[char];
    return !!p && !this.isNew(char) && p.due <= now;
  },

  /** Recognised reliably enough to be asked to write it from memory. */
  canWrite(char: string): boolean {
    return (state.chars[char]?.reps ?? 0) >= 2;
  },

  isSeen(char: string): boolean {
    return !this.isNew(char);
  },

  isMastered(char: string): boolean {
    return (state.chars[char]?.interval ?? 0) >= MASTERED_INTERVAL;
  },

  /** Missed at some point and not yet stable. */
  isWeak(char: string): boolean {
    const p = state.chars[char];
    return !!p && p.wrong > 0 && p.interval < 7;
  },

  /** Today's session: due cards first (most overdue first), then unseen ones in frequency order. */
  buildQueue<T extends { character: string }>(chars: T[], extraNew = 0): { due: T[]; fresh: T[] } {
    const now = Date.now();
    const due = chars
      .filter((c) => this.isDue(c.character, now))
      .sort((a, b) => state.chars[a.character].due - state.chars[b.character].due)
      .slice(0, SESSION_SIZE);
    const freshBudget =
      extraNew ||
      Math.max(0, Math.min(NEW_PER_DAY - this.daily.introduced, SESSION_SIZE - due.length));
    const fresh = chars.filter((c) => this.isNew(c.character)).slice(0, freshBudget);
    return { due, fresh };
  },

  get daily(): DailyLog {
    return currentDaily();
  },

  clear() {
    setState({ chars: {}, daily: emptyDaily() });
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  },
};
