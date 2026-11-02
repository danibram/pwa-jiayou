import { createSignal } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { isNonNegativeInteger, isRecord } from '../utils/parse';

export type Grade = 'again' | 'hard' | 'good';
export const GRADES = ['again', 'hard', 'good'] as const satisfies readonly Grade[];

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
  /** Bien answers in a row since the last miss, free practice included. */
  clean: number;
}

export interface DailyLog {
  day: string;
  reviewed: number;
  introduced: number;
  /** Consecutive days with at least one review, including `day`. */
  streak: number;
}

interface ProgressState {
  chars: Record<string, CharProgress>;
  daily: DailyLog;
  words: Record<string, CharProgress>;
  wordDaily: DailyLog;
  /** Answers and first looks per local day (words and characters), for the progress calendar. */
  activity: Record<string, number>;
}

const STORAGE_KEY = 'hsk-flashcards-stats';
const DAY_MS = 86_400_000;
const MASTERED_INTERVAL = 21;
export const DAILY_GOAL = 20;
export const NEW_PER_DAY = 10;
/** New characters a day, shared by every way into a session. Each one is watched, traced and written. */
export const CHAR_NEW_PER_DAY = 8;
/** Characters already known from words, checked at the start of a session. They do not spend the cap. */
export const KNOWN_PER_SESSION = 10;
export const WORD_NEW_PER_DAY = 20;
/** The daily cap in words, for Home and word detail to explain it. */
export const DAILY_NEW_RULE_TEXT = `${WORD_NEW_PER_DAY} palabras y ${CHAR_NEW_PER_DAY} caracteres nuevos al día`;
/**
 * Bien answers in a row that take an item off the weak list in ordinary sessions.
 * A Bien inside a Flojos session is enough on its own: that session exists to clear them.
 */
export const CLEAN_TO_RECOVER = 2;
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
  clean: 0,
});

/** Missed at some point and not yet answered Bien twice in a row since. */
export const isWeakProgress = (p: CharProgress | undefined): boolean =>
  !!p && p.wrong > 0 && p.clean < CLEAN_TO_RECOVER && p.interval < MASTERED_INTERVAL;

const afterAnswer = (clean: number, grade: Grade) => (grade === 'again' ? 0 : grade === 'good' ? clean + 1 : clean);

const invalidCharacter = () => new Error('Hay datos de caracteres no válidos.');

const countField = (value: Record<string, unknown>, key: string): number => {
  if (!(key in value) || value[key] === undefined) return 0;
  const field = value[key];
  if (!isNonNegativeInteger(field)) throw invalidCharacter();
  return field;
};

const easeField = (value: Record<string, unknown>): number => {
  if (!('ease' in value) || value.ease === undefined) return 2.5;
  const field = value.ease;
  if (typeof field !== 'number' || !Number.isFinite(field) || field < 1.3) throw invalidCharacter();
  return field;
};

const strokeBestField = (value: Record<string, unknown>): number | null => {
  if (!('strokeBest' in value) || value.strokeBest === undefined || value.strokeBest === null) return null;
  const field = value.strokeBest;
  if (!isNonNegativeInteger(field)) throw invalidCharacter();
  return field;
};

const parseCharacterProgress = (value: Record<string, unknown>): CharProgress => ({
  right: countField(value, 'right'),
  wrong: countField(value, 'wrong'),
  reps: countField(value, 'reps'),
  lapses: countField(value, 'lapses'),
  interval: countField(value, 'interval'),
  ease: easeField(value),
  due: countField(value, 'due'),
  strokeRuns: countField(value, 'strokeRuns'),
  strokeBest: strokeBestField(value),
  lastSeen: countField(value, 'lastSeen'),
  // Older saves have no counter. Successful reviews since the last lapse are the same idea.
  clean: 'clean' in value && value.clean !== undefined ? countField(value, 'clean') : countField(value, 'reps'),
});

const parseDaily = (value: unknown): DailyLog => {
  if (!isRecord(value) || typeof value.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.day)) {
    throw new Error('El registro diario no es válido.');
  }
  const date = new Date(`${value.day}T00:00:00Z`);
  const reviewed = value.reviewed;
  const introduced = value.introduced;
  const streak = value.streak;
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value.day ||
    !isNonNegativeInteger(reviewed) || !isNonNegativeInteger(introduced) || !isNonNegativeInteger(streak)) {
    throw new Error('El registro diario no es válido.');
  }
  return { day: value.day, reviewed, introduced, streak };
};

/** Accepts legacy character maps and the current versioned backup format. */
export const parseProgress = (raw: string): ProgressState => {
  const saved: unknown = JSON.parse(raw);
  if (!isRecord(saved)) throw new Error('El archivo no contiene datos de progreso válidos.');
  if ('version' in saved && saved.version !== 2 && saved.version !== 3) throw new Error('Esta versión de la copia no es compatible.');
  const chars = 'chars' in saved ? saved.chars : saved;
  if (!isRecord(chars)) throw new Error('La lista de caracteres no es válida.');
  const migrated: Record<string, CharProgress> = {};
  for (const [char, value] of Object.entries(chars)) {
    if (!('chars' in saved) && char === 'daily') continue;
    if (!char || !isRecord(value) || [...char].length !== 1 || ['__proto__', 'constructor', 'prototype'].includes(char)) {
      throw invalidCharacter();
    }
    migrated[char] = parseCharacterProgress(value);
  }
  const daily = 'daily' in saved ? parseDaily(saved.daily) : emptyDaily();
  if (saved.version === 2 && (!('chars' in saved) || !('daily' in saved))) throw new Error('La copia está incompleta.');
  const words: Record<string, CharProgress> = {};
  if (saved.version === 3) {
    if (!isRecord(saved.words) || !('wordDaily' in saved) || !('chars' in saved) || !('daily' in saved)) throw new Error('La copia está incompleta.');
    for (const [id, value] of Object.entries(saved.words)) {
      if (!id || ['__proto__', 'constructor', 'prototype'].includes(id) || !isRecord(value)) throw invalidCharacter();
      words[id] = parseCharacterProgress(value);
    }
  }
  const wordDaily = saved.version === 3 ? parseDaily(saved.wordDaily) : emptyDaily();
  // Optional: saves from before the calendar have none.
  const activity: Record<string, number> = {};
  if (isRecord(saved.activity)) {
    for (const [day, count] of Object.entries(saved.activity)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && isNonNegativeInteger(count)) activity[day] = count;
    }
  }
  return { chars: migrated, daily, words, wordDaily, activity };
};

let loadBlocked = false;
const [storageError, setStorageError] = createSignal<string | null>(null);
const load = (): ProgressState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? { chars: {}, daily: emptyDaily(), words: {}, wordDaily: emptyDaily(), activity: {} } : parseProgress(raw);
  } catch {
    loadBlocked = true;
    setStorageError('No se pudo leer el progreso guardado. No se sobrescribirá.');
    return { chars: {}, daily: emptyDaily(), words: {}, wordDaily: emptyDaily(), activity: {} };
  }
};

const [state, setState] = createStore<ProgressState>(load());
const serialize = (data: ProgressState) => JSON.stringify({ version: 3, chars: data.chars, daily: data.daily, words: data.words, wordDaily: data.wordDaily, activity: data.activity });

const ACTIVITY_DAYS = 120;

/** Counts one answer or first look today and drops days older than the calendar shows. */
const logActivity = () => {
  const day = today();
  const next: Record<string, number> = { ...state.activity, [day]: (state.activity[day] ?? 0) + 1 };
  const keep = Object.keys(next).sort().slice(-ACTIVITY_DAYS);
  setState('activity', reconcile(Object.fromEntries(keep.map((key) => [key, next[key]]))));
};

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

/**
 * Words missed in a session before their first graded answer. A word is enrolled when its recall
 * card is graded, so a miss on an earlier pick card would otherwise leave no trace and the word
 * would not show as flojo on Home. Kept in memory: it only has to last until that recall.
 */
const missedBeforeEnrolment = new Set<string>();

const save = (): boolean => {
  if (loadBlocked) return false;
  try {
    localStorage.setItem(STORAGE_KEY, serialize(state));
    setStorageError(null);
    return true;
  } catch {
    setStorageError('No se pudo guardar el progreso. Exporta una copia y vuelve a intentarlo.');
    return false;
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
    streak: d.day === yesterday() && (d.reviewed > 0 || d.introduced > 0) ? d.streak : 0,
  };
};

const schedule = (p: CharProgress, grade: Grade, now: number): CharProgress => {
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

/** Everything a session can change, taken when it starts so "descartar" can undo it. */
export type ProgressCheckpoint = string;

export const progressStore = {
  storageError,

  /** Words and characters share one store, so one checkpoint covers both kinds of session. */
  checkpoint(): ProgressCheckpoint {
    return serialize(state);
  },

  /** Answers and first looks per local day ("2026-11-01" → 34), oldest first, at most 120 days. */
  activity(): Record<string, number> {
    return state.activity;
  },

  /** Puts progress, daily counts and streak back exactly as they were at `checkpoint()`. */
  rollback(checkpoint: ProgressCheckpoint): void {
    missedBeforeEnrolment.clear();
    setState(reconcile(parseProgress(checkpoint)));
    save();
  },

  exportBackup(): string {
    return serialize(state);
  },

  importBackup(raw: string): void {
    const imported = parseProgress(raw);
    // Write first so a failed import leaves both the current state and stored data intact.
    localStorage.setItem(STORAGE_KEY, serialize(imported));
    setState(reconcile(imported));
    loadBlocked = false;
    setStorageError(null);
  },

  retrySave(): boolean {
    if (loadBlocked) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw !== null) {
          const recovered = parseProgress(raw);
          // Do not discard progress made in memory while storage was unavailable.
          if (Object.keys(state.chars).length > 0 || Object.keys(state.words).length > 0) {
            setStorageError('El progreso actual y el guardado difieren. Exporta el actual antes de restaurar el guardado.');
            return false;
          }
          setState(reconcile(recovered));
        }
        loadBlocked = false;
      } catch {
        setStorageError('No se pudo leer el progreso guardado. No se sobrescribirá.');
        return false;
      }
    }
    return save();
  },

  recoverStoredProgress(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) {
        setStorageError('No se encontró progreso guardado para recuperar.');
        return false;
      }
      const recovered = parseProgress(raw);
      setState(reconcile(recovered));
      loadBlocked = false;
      setStorageError(null);
      return true;
    } catch {
      setStorageError('No se pudo leer el progreso guardado. No se sobrescribirá.');
      return false;
    }
  },
  get(char: string): CharProgress | undefined {
    return state.chars[char];
  },

  /** `free`: a character already known from a word. It does not spend the daily new-character cap. */
  grade(char: string, grade: Grade, options: { free?: boolean } = {}) {
    const now = Date.now();
    const isNew = !state.chars[char] || state.chars[char].right + state.chars[char].wrong === 0;
    update(char, (p) => ({ ...schedule(p, grade, now), lastSeen: now }));
    const daily = currentDaily();
    setState('daily', {
      ...daily,
      reviewed: daily.reviewed + 1,
      introduced: daily.introduced + (isNew && !options.free ? 1 : 0),
      streak: daily.reviewed === 0 && daily.introduced === 0 ? daily.streak + 1 : daily.streak,
    });
    logActivity();
    save();
  },

  /**
   * A first look. The character comes back tomorrow as a real question.
   * It does not count as a right or a wrong answer.
   */
  introduce(char: string, options: { free?: boolean } = {}) {
    if (!this.isNew(char)) return;
    const now = Date.now();
    update(char, (p) => ({
      ...p,
      interval: 1,
      due: now + DAY_MS,
      lastSeen: now,
    }));
    const daily = currentDaily();
    setState('daily', {
      ...daily,
      introduced: daily.introduced + (options.free ? 0 : 1),
      streak: daily.reviewed === 0 && daily.introduced === 0 ? daily.streak + 1 : daily.streak,
    });
    logActivity();
    save();
  },

  /** Free practice: counts the answer but leaves the schedule alone, so cramming can't inflate intervals. */
  practice(char: string, correct: boolean) {
    // Due and weak characters are what a review is for, so their answers move the schedule.
    if (this.isDue(char) || this.isWeak(char)) return this.grade(char, correct ? 'good' : 'again');
    if (this.isNew(char)) return;
    update(char, (p) => ({
      ...p,
      right: p.right + (correct ? 1 : 0),
      wrong: p.wrong + (correct ? 0 : 1),
      clean: afterAnswer(p.clean, correct ? 'good' : 'again'),
      lastSeen: Date.now(),
    }));
    // Practice still counts on the calendar, the same moment it is answered.
    logActivity();
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

  /** Missed at some point and not yet answered Bien twice in a row since. */
  isWeak(char: string): boolean {
    return isWeakProgress(state.chars[char]);
  },

  /** A Bien in a Flojos session: the character leaves the weak list now. Returns whether it was weak. */
  recoverWeak(char: string): boolean {
    if (!this.isWeak(char)) return false;
    update(char, (p) => ({ ...p, clean: Math.max(p.clean, CLEAN_TO_RECOVER) }));
    save();
    return true;
  },

  /** New characters the daily cap still allows today. */
  newLeftToday(): number {
    return Math.max(0, CHAR_NEW_PER_DAY - this.daily.introduced);
  },

  /**
   * Today's session: due cards first (most overdue first), then unseen ones in frequency order.
   * A character missed earlier today is not due again today: the session already asked it twice.
   */
  buildQueue<T extends { character: string }>(
    chars: T[],
    extraNew = 0,
    /** Unseen characters the learner already met in a word. They go in `known`, outside the cap. */
    prefer: (char: string) => boolean = () => false,
  ): { due: T[]; fresh: T[]; known: T[] } {
    const now = Date.now();
    const startOfDay = new Date(now).setHours(0, 0, 0, 0);
    const due = chars
      .filter((c) => this.isDue(c.character, now) && !(state.chars[c.character].interval === 0 && state.chars[c.character].due >= startOfDay))
      .sort((a, b) => state.chars[a.character].due - state.chars[b.character].due)
      .slice(0, SESSION_SIZE);
    const left = this.newLeftToday();
    const unseen = chars.filter((c) => this.isNew(c.character));
    const known = unseen.filter((c) => prefer(c.character)).slice(0, KNOWN_PER_SESSION);
    const budget = extraNew ? Math.min(extraNew, left) : Math.max(0, Math.min(left, SESSION_SIZE - due.length));
    const fresh = unseen.filter((c) => !prefer(c.character)).slice(0, budget);
    return { due, fresh, known };
  },

  /** Days in a row with any practice. The same number for words and characters. */
  streak(): number {
    return activityStreak(state.activity);
  },

  get daily(): DailyLog {
    return { ...currentDaily(), streak: activityStreak(state.activity) };
  },

  clear() {
    missedBeforeEnrolment.clear();
    setState({ chars: {}, daily: emptyDaily(), words: {}, wordDaily: emptyDaily(), activity: {} });
    save();
  },
};


const currentWordDaily = (): DailyLog => {
  const d = state.wordDaily;
  if (d.day === today()) return d;
  return { day: today(), reviewed: 0, introduced: 0, streak: d.day === yesterday() && (d.reviewed > 0 || d.introduced > 0) ? d.streak : 0 };
};

export const vocabularyProgressStore = {
  storageError,
  get(id: string): CharProgress | undefined { return state.words[id]; },
  isNew(id: string): boolean {
    const p = state.words[id];
    return !p || (p.right + p.wrong === 0 && p.due === 0);
  },
  isDue(id: string, now = Date.now()): boolean {
    const p = state.words[id];
    return !!p && !this.isNew(id) && p.due <= now;
  },
  isMastered(id: string): boolean { return (state.words[id]?.interval ?? 0) >= MASTERED_INTERVAL; },
  isWeak(id: string): boolean { return isWeakProgress(state.words[id]); },
  /** A Bien in a Flojos session: the word leaves the weak list now. Returns whether it was weak. */
  recoverWeak(id: string): boolean {
    const p = state.words[id];
    if (!isWeakProgress(p)) return false;
    setState('words', id, { ...p, clean: Math.max(p.clean, CLEAN_TO_RECOVER) });
    save();
    return true;
  },
  /** Whether a review answer moves this word's schedule: it is due, or it is weak. */
  schedules(id: string): boolean { return this.isDue(id) || this.isWeak(id); },
  /** New words the daily cap still allows today. */
  newLeftToday(): number { return Math.max(0, WORD_NEW_PER_DAY - this.daily.introduced); },
  introduce(id: string): void {
    if (!this.isNew(id)) return;
    const now = Date.now();
    setState('words', id, { ...empty(), interval: 1, due: now + DAY_MS, lastSeen: now });
    const daily = currentWordDaily();
    setState('wordDaily', { ...daily, introduced: daily.introduced + 1, streak: daily.reviewed === 0 && daily.introduced === 0 ? daily.streak + 1 : daily.streak });
    logActivity();
    save();
  },
  grade(id: string, grade: Grade): void {
    const now = Date.now();
    const isNew = this.isNew(id);
    const scheduled = schedule(state.words[id] ?? empty(), grade, now);
    // Missed earlier in this session, before it was enrolled: it starts out flojo.
    const missed = missedBeforeEnrolment.delete(id) && grade !== 'again';
    setState('words', id, { ...scheduled, ...(missed ? { wrong: scheduled.wrong + 1, clean: 0 } : {}), lastSeen: now });
    const daily = currentWordDaily();
    setState('wordDaily', { ...daily, reviewed: daily.reviewed + 1, introduced: daily.introduced + (isNew ? 1 : 0), streak: daily.reviewed === 0 && daily.introduced === 0 ? daily.streak + 1 : daily.streak });
    logActivity();
    save();
  },
  practice(id: string, grade: Grade, scheduleDue = true): void {
    if (scheduleDue && this.schedules(id)) return this.grade(id, grade);
    if (this.isNew(id)) {
      if (grade === 'again') missedBeforeEnrolment.add(id);
      return;
    }
    const p = state.words[id];
    setState('words', id, { ...p, right: p.right + (grade === 'again' ? 0 : 1), wrong: p.wrong + (grade === 'again' ? 1 : 0), clean: afterAnswer(p.clean, grade), lastSeen: Date.now() });
    // Practice counts on the calendar, the same as for characters.
    logActivity();
    save();
  },
  buildQueue<T extends { id: string }>(entries: T[], extraNew = 0): { due: T[]; fresh: T[] } {
    const now = Date.now();
    const due = entries.filter((entry) => this.isDue(entry.id, now)).sort((a, b) => state.words[a.id].due - state.words[b.id].due).slice(0, SESSION_SIZE);
    // The daily session teaches ten. "Aprender más" reaches the rest of the cap.
    const left = this.newLeftToday();
    const budget = extraNew ? Math.min(extraNew, left) : Math.max(0, Math.min(NEW_PER_DAY - this.daily.introduced, left, SESSION_SIZE - due.length));
    return { due, fresh: entries.filter((entry) => this.isNew(entry.id)).slice(0, budget) };
  },
  get daily(): DailyLog { return { ...currentWordDaily(), streak: activityStreak(state.activity) }; },
};

/** Whether today's cap still allows a new word or character. */
export const canLearnNew = (kind: 'word' | 'char'): boolean =>
  (kind === 'word' ? vocabularyProgressStore.newLeftToday() : progressStore.newLeftToday()) > 0;
