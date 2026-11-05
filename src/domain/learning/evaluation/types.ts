import type {
  Exercise,
  InvalidEvaluation,
  ScheduledRating,
  SessionAttempt,
  SessionMode,
  SkillEvidence,
  ValidEvaluation,
} from '../types';

/** One of `Exercise.options`, with the published content it shows. */
export type ExerciseOption = Exercise['options'][number];

export type EvaluableExercise = Omit<Exercise, 'options'> & { options: readonly ExerciseOption[] };

/** What the evaluator reads from a session attempt. */
export type AttemptInput = Pick<SessionAttempt, 'id' | 'itemId' | 'actions'>;

export interface EvaluationContext {
  sessionMode: SessionMode;
  /**
   * Whether the item may take a scheduled rating now, as the scheduler computes it from the item's
   * cache: due today, a short step that has come due, or a new word past `eligibleFrom`.
   */
  scheduledEligible: boolean;
  /** The "Ya la sé" meaning card shown right after the claim. It rates without waiting a day. */
  alreadyKnownCheck: boolean;
  /**
   * Set by the session layer when it closes an attempt as invalid without an answer action, such as
   * a resumed attempt whose content revision changed. Wins over anything in the actions.
   */
  invalidation?: InvalidEvaluation;
}

/** A wrong option the learner picked, and the content it showed. */
export interface Confusion {
  optionId: string;
  contentId: string | null;
}

/**
 * `SkillEvidence` plus what metrics and confusions need. Local until `types.ts` adds the fields;
 * it is assignable to `SkillEvidence`, so the event stores the extra fields as they are.
 */
export interface SkillObservation extends SkillEvidence {
  /** A hint that gave the answer away (any hint, for writing) came before the first answer. */
  assisted: boolean;
  /** Wrong options selected, in order. Empty outside multiple choice. */
  confusions: readonly Confusion[];
  /** Stroke mistakes counted on the first drawing. Null when the attempt has no drawing. */
  mistakes: number | null;
}

/** Why an attempt that answered validly does not rate. */
export type PracticeReason =
  /** The session mode never rates (Flojos). */
  | 'session-mode'
  /** The exercise is not the item's rating task: options, reverse, listening, tracing. */
  | 'exercise'
  /** The rating task, but the scheduler says the item is not eligible now. */
  | 'not-eligible'
  /** A "Ya la sé" check without a clean correct recall. The word follows the normal path. */
  | 'already-known-miss';

interface ResultBase {
  /** Write this, not the version the queue stored: the rules that ran are the current ones. */
  evaluatorVersion: string;
}

/**
 * Which attempt event to write. Only `scheduled-review` updates FSRS; its fields spread into the
 * event as `ScheduledRating`.
 */
export type EvaluationResult =
  | (ResultBase & ScheduledRating & { kind: 'scheduled-review'; evidence: readonly SkillObservation[] })
  | (ResultBase & {
      kind: 'practice';
      reason: PracticeReason;
      evaluation: ValidEvaluation;
      evidence: readonly SkillObservation[];
    })
  | (ResultBase & { kind: 'invalid-attempt'; evaluation: InvalidEvaluation; evidence: readonly [] });
