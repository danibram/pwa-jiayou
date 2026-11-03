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

export interface ProgressState {
  chars: Record<string, CharProgress>;
  daily: DailyLog;
  words: Record<string, CharProgress>;
  wordDaily: DailyLog;
  /** Answers and first looks per local day (words and characters), for the progress calendar. */
  activity: Record<string, number>;
}

