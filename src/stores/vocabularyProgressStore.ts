import { afterAnswer, schedule } from '../domain/progress/schedule';
import {
  activityStreak,
  buildWordQueue,
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
import { emptyProgress, progressDocument, type ProgressDocument } from './progressState';

const DAY_MS = 86_400_000;

/** Word progress over `doc`, the same document progressStore uses for activity and checkpoints. */
export const createVocabularyProgressStore = (doc: ProgressDocument) => {
  const { state, setState, storageError, writeRecord, logActivity, missedBeforeEnrolment, save } = doc;
  return {
    storageError,
    get(id: string): CharProgress | undefined { return state.words[id]; },
    isNew(id: string): boolean { return isNewProgress(state.words[id]); },
    isDue(id: string, now = Date.now()): boolean { return isDueProgress(state.words[id], now); },
    isMastered(id: string): boolean { return (state.words[id]?.interval ?? 0) >= MASTERED_INTERVAL; },
    isWeak(id: string): boolean { return isWeakProgress(state.words[id]); },
    /** A Bien in a Flojos session: the word leaves the weak list now. Returns whether it was weak. */
    recoverWeak(id: string): boolean {
      const p = state.words[id];
      if (!isWeakProgress(p)) return false;
      writeRecord('words', id, { ...p, clean: Math.max(p.clean, CLEAN_TO_RECOVER) });
      save();
      return true;
    },
    /** Whether a review answer moves this word's schedule: it is due, or it is weak. */
    schedules(id: string): boolean { return this.isDue(id) || this.isWeak(id); },
    /** New words the daily cap still allows today. */
    newLeftToday(): number { return newLeftToday(WORD_NEW_PER_DAY, state.wordDaily); },
    introduce(id: string): void {
      if (!this.isNew(id)) return;
      const now = Date.now();
      writeRecord('words', id, { ...emptyProgress(), interval: 1, due: now + DAY_MS, lastSeen: now });
      const daily = currentDaily(state.wordDaily);
      setState('wordDaily', { ...daily, introduced: daily.introduced + 1, streak: daily.reviewed === 0 && daily.introduced === 0 ? daily.streak + 1 : daily.streak });
      logActivity();
      save();
    },
    grade(id: string, grade: Grade): void {
      const now = Date.now();
      const isNew = this.isNew(id);
      const scheduled = schedule(state.words[id] ?? emptyProgress(), grade, now);
      // Missed earlier in this session, before it was enrolled: it starts out flojo.
      const missed = missedBeforeEnrolment.delete(id) && grade !== 'again';
      writeRecord('words', id, { ...scheduled, ...(missed ? { wrong: scheduled.wrong + 1, clean: 0 } : {}), lastSeen: now });
      const daily = currentDaily(state.wordDaily);
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
      writeRecord('words', id, { ...p, right: p.right + (grade === 'again' ? 0 : 1), wrong: p.wrong + (grade === 'again' ? 1 : 0), clean: afterAnswer(p.clean, grade), lastSeen: Date.now() });
      // Practice counts on the calendar, the same as for characters.
      logActivity();
      save();
    },
    /** Today's session. The rules live in `buildWordQueue`. */
    buildQueue<T extends { id: string }>(entries: T[], extraNew = 0): { due: T[]; fresh: T[] } {
      return buildWordQueue(entries, state.words, state.wordDaily, extraNew);
    },
    get daily(): DailyLog { return { ...currentDaily(state.wordDaily), streak: activityStreak(state.activity) }; },
  };
};

export const vocabularyProgressStore = createVocabularyProgressStore(progressDocument);
