import type { ExerciseSelection } from '../../domain/learning/exercises';
import type { AttemptAction, Hint, Rating } from '../../domain/learning/types';

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
}

/** What the screen reports. The controller evaluates, rates and saves; the components never do. */
export interface LearningSessionActions {
  answer(input: { answer?: string | null; optionId?: string | null }): void;
  reveal(): void;
  hint(hint: Hint): void;
  selfAssess(rating: Rating): void;
  drawing(input: { mistakes: number }): void;
  knowIt(): void;
  continue(): void;
  undoLast(): void;
  pause(): void;
  resume(): void;
  retry(): void;
  audioFailed(): void;
}
