import type { ExerciseSelection } from '@jiayou/learning/exercises';
import type { AttemptAction, Hint, Rating } from '@jiayou/learning/types';

/**
 * What the session controller (`src/stores/learningSessionStore.ts`) exposes to the screen. Kept
 * here with the same shape so the components do not import the store.
 */
export interface LearningSessionView {
  state: 'loading' | 'presenting' | 'feedback' | 'saving' | 'paused' | 'finished' | 'error';
  selection: ExerciseSelection | null;
  actions: readonly AttemptAction[];
  revealed: boolean;
  feedback: {
    outcome: 'correct' | 'partial' | 'incorrect' | 'invalid';
    rating: Rating | null;
    recorded: 'scheduled-review' | 'practice' | 'invalid-attempt' | 'exposure';
  } | null;
  position: number;
  total: number;
  speechAvailable: boolean;
  /** A confirmed answer in this session that undoLast would void. False while saving. */
  canUndo: boolean;
  error: { message: string; retryable: boolean } | null;
  /** Why the last typed answer was not taken. Nothing was saved and the field stays open. */
  inputError: string | null;
  /** The teaching card offers "Ya la sé" before showing the answer. */
  canClaimKnown: boolean;
  /** A new word's first teaching, shown in full because today's "Ya la sé" claims are used up. */
  claimsUsedUp: boolean;
  /** New for every card put on screen. Cards remount on it and pass it back with what they report. */
  cardKey: string;
  /** A teaching card's step: `ask` before "Enséñamela", `open` after it or when it never asks. */
  lesson: { mode: 'ask' | 'open'; again: boolean } | null;
  /** The check right after "Ya la sé": the meaning among options. */
  claimedCheck: boolean;
  /** On a result: `flash` shows the right answer a moment and moves on by itself, `wait` waits for Continuar. */
  after: 'wait' | 'flash';
}

/** What the screen reports. The controller evaluates, rates and saves; the components never do. */
export interface LearningSessionActions {
  answer(input: { answer?: string | null; optionId?: string | null }): void;
  reveal(): void;
  hint(hint: Hint): void;
  selfAssess(rating: Rating): void;
  drawing(input: { mistakes: number }): void;
  knowIt(cardKey?: string): void;
  openLesson(cardKey?: string): void;
  continue(cardKey?: string): void;
  undoLast(): void;
  pause(): void;
  resume(): void;
  retry(): void;
  audioFailed(): void;
}
