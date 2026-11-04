import type { ActivityByDevice } from './activity';

/** How an answer went: Otra vez, Difícil or Bien. */
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
  /** Epoch ms of the last graded answer. Free practice and stroke runs leave it alone. 0 in older saves. */
  lastReview?: number;
  /** Epoch ms of the last write. Of two copies of a record, the later one wins. */
  updatedAt: number;
  /** The device that wrote it last. Breaks a tie between two writes in the same millisecond. */
  deviceId: string;
}

export interface DailyLog {
  day: string;
  reviewed: number;
  introduced: number;
  /** Consecutive days with at least one review, including `day`. */
  streak: number;
}

export interface ProgressState {
  chars: Record<string, CharProgress>;
  daily: DailyLog;
  words: Record<string, CharProgress>;
  wordDaily: DailyLog;
  /** Answers and first looks per local day (words and characters), per device, for the calendar and streak. */
  activity: ActivityByDevice;
}

