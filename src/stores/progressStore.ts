import { afterAnswer, schedule } from '../domain/progress/schedule';
import { reconcile } from 'solid-js/store';
import { parseProgress } from '../domain/progress/serialization';
import {
  activityStreak,
  buildCharQueue,
  CHAR_NEW_PER_DAY,
  CLEAN_TO_RECOVER,
  currentDaily,
  isDueProgress,
  isNewProgress,
  isWeakProgress,
  MASTERED_INTERVAL,
  newLeftToday,
  WORD_NEW_PER_DAY,
} from '../domain/progress/queue';
import type { CharProgress, DailyLog, Grade } from '../domain/progress/types';
import {
  emptyProgress,
  emptyState,
  isLoadBlocked,
  logActivity,
  missedBeforeEnrolment,
  readStored,
  save,
  serialize,
  setLoadBlocked,
  setState,
  setStorageError,
  state,
  storageError,
  writeStored,
} from './progressState';
import { vocabularyProgressStore } from './vocabularyProgressStore';
export { parseProgress } from '../domain/progress/serialization';
export type { CharProgress, DailyLog, Grade } from '../domain/progress/types';
export { GRADES } from '../domain/progress/types';
export {
  activityStreak,
  CHAR_NEW_PER_DAY,
  CLEAN_TO_RECOVER,
  isWeakProgress,
  KNOWN_PER_SESSION,
  NEW_PER_DAY,
  SESSION_SIZE,
  WORD_NEW_PER_DAY,
} from '../domain/progress/queue';

const DAY_MS = 86_400_000;
export const DAILY_GOAL = 20;
/** The daily cap in words, for Home and word detail to explain it. */
export const DAILY_NEW_RULE_TEXT = `${WORD_NEW_PER_DAY} palabras y ${CHAR_NEW_PER_DAY} caracteres nuevos al día`;

const update = (char: string, fn: (p: CharProgress) => CharProgress) => {
  setState('chars', char, fn(state.chars[char] ?? emptyProgress()));
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
    writeStored(imported);
    setState(reconcile(imported));
    setLoadBlocked(false);
    setStorageError(null);
  },

  retrySave(): boolean {
    if (isLoadBlocked()) {
      try {
        const recovered = readStored();
        if (recovered !== null) {
          // Do not discard progress made in memory while storage was unavailable.
          if (Object.keys(state.chars).length > 0 || Object.keys(state.words).length > 0) {
            setStorageError('El progreso actual y el guardado difieren. Exporta el actual antes de restaurar el guardado.');
            return false;
          }
          setState(reconcile(recovered));
        }
        setLoadBlocked(false);
      } catch {
        setStorageError('No se pudo leer el progreso guardado. No se sobrescribirá.');
        return false;
      }
    }
    return save();
  },

  recoverStoredProgress(): boolean {
    try {
      const recovered = readStored();
      if (recovered === null) {
        setStorageError('No se encontró progreso guardado para recuperar.');
        return false;
      }
      setState(reconcile(recovered));
      setLoadBlocked(false);
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
    const daily = currentDaily(state.daily);
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
    const daily = currentDaily(state.daily);
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
    return isNewProgress(state.chars[char]);
  },

  isDue(char: string, now = Date.now()): boolean {
    return isDueProgress(state.chars[char], now);
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
    return newLeftToday(CHAR_NEW_PER_DAY, state.daily);
  },

  /** Today's session. The rules live in `buildCharQueue`. */
  buildQueue<T extends { character: string }>(
    chars: T[],
    extraNew = 0,
    /** Unseen characters the learner already met in a word. They go in `known`, outside the cap. */
    prefer: (char: string) => boolean = () => false,
  ): { due: T[]; fresh: T[]; known: T[] } {
    return buildCharQueue(chars, state.chars, state.daily, extraNew, prefer);
  },

  /** Days in a row with any practice. The same number for words and characters. */
  streak(): number {
    return activityStreak(state.activity);
  },

  get daily(): DailyLog {
    return { ...currentDaily(state.daily), streak: activityStreak(state.activity) };
  },

  clear() {
    missedBeforeEnrolment.clear();
    setState(emptyState());
    save();
  },
};

/** Whether today's cap still allows a new word or character. */
export const canLearnNew = (kind: 'word' | 'char'): boolean =>
  (kind === 'word' ? vocabularyProgressStore.newLeftToday() : progressStore.newLeftToday()) > 0;
