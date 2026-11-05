import {
  WRITING_FROM_MEMORY,
  type AttemptAction,
  type InvalidEvaluation,
  type ItemId,
  type Rating,
  type Timestamp,
  type ValidEvaluation,
} from '../types.ts';
import type { Confusion, EvaluableExercise } from './types.ts';
import { itemKind } from '../items.ts';

/**
 * The task that may rate an item. A word rates only from recalling its meaning from the characters
 * without options and rating oneself. A character rates only from drawing it from memory.
 *
 * `Exercise` has no stage field, so writing from memory is told apart by its cue: watching and
 * tracing show the character (`cue: 'characters'`), drawing from memory starts from the gloss or
 * the audio.
 */
export type RatingTask = 'meaning' | 'writing';

export const ratingTaskOf = (itemId: ItemId, exercise: EvaluableExercise): RatingTask | null => {
  if (
    itemKind(itemId) === 'word-meaning' &&
    exercise.skill === 'meaning' &&
    exercise.format === 'free-recall' &&
    exercise.grading === 'self-assessment' &&
    exercise.cue === 'characters'
  ) return 'meaning';
  if (
    itemId.startsWith('character-writing:') &&
    exercise.skill === 'writing' &&
    exercise.format === 'writing' &&
    exercise.cue !== 'characters'
  ) return 'writing';
  return null;
};

/** The first invalid evaluation among the actions. Any one makes the whole attempt invalid. */
export const findInvalid = (actions: readonly AttemptAction[]): InvalidEvaluation | null => {
  for (const action of actions) {
    if (action.type === 'answer' && action.evaluation.outcome === 'invalid') return action.evaluation;
  }
  return null;
};

type ValidAnswer = Extract<AttemptAction, { type: 'answer' }> & { evaluation: ValidEvaluation };
type Drawing = Extract<AttemptAction, { type: 'drawing' }>;
type SelfAssessment = Extract<AttemptAction, { type: 'self-assessment' }>;

/** What the rules need from an attempt's actions, read once. Call only after `findInvalid` returns null. */
export interface AttemptReading {
  firstAnswer: ValidAnswer | null;
  firstDrawing: Drawing | null;
  /** The first one counts. Rating again on second thought is a retry, not the answer. */
  firstSelfAssessment: SelfAssessment | null;
  /**
   * A hint that reveals the answer before the first answer, drawing, reveal or self-assessment.
   * A hint after that point gives nothing away the learner had not already committed to or seen.
   */
  revealingHintFirst: boolean;
  anyHint: boolean;
  confusions: readonly Confusion[];
  /** When the first deciding action happened. Null when there is none. */
  decidedAt: Timestamp | null;
}

export const readAttempt = (exercise: EvaluableExercise, actions: readonly AttemptAction[]): AttemptReading => {
  let firstAnswer: ValidAnswer | null = null;
  let firstDrawing: Drawing | null = null;
  let firstSelfAssessment: SelfAssessment | null = null;
  let committed = false;
  let revealingHintFirst = false;
  let anyHint = false;
  const confusions: Confusion[] = [];
  const contentOf = new Map(exercise.options.map((option) => [option.id, option.contentId ?? null]));

  for (const action of actions) {
    switch (action.type) {
      case 'hint':
        anyHint = true;
        if (!committed && action.hint.revealsAnswer) revealingHintFirst = true;
        break;
      case 'answer': {
        committed = true;
        const evaluation = action.evaluation;
        if (evaluation.outcome === 'invalid') break;
        if (!firstAnswer) firstAnswer = { ...action, evaluation };
        if (evaluation.outcome === 'incorrect' && action.selectedOptionId !== null) {
          confusions.push({ optionId: action.selectedOptionId, contentId: contentOf.get(action.selectedOptionId) ?? null });
        }
        break;
      }
      case 'drawing':
        committed = true;
        if (!firstDrawing) firstDrawing = action;
        break;
      case 'reveal':
        committed = true;
        break;
      case 'self-assessment':
        committed = true;
        if (!firstSelfAssessment) firstSelfAssessment = action;
        break;
    }
  }

  const decidedAt = Math.min(
    firstAnswer?.at ?? Infinity,
    firstDrawing?.at ?? Infinity,
    firstSelfAssessment?.at ?? Infinity,
  );
  return {
    firstAnswer,
    firstDrawing,
    firstSelfAssessment,
    revealingHintFirst,
    anyHint,
    confusions,
    decidedAt: Number.isFinite(decidedAt) ? decidedAt : null,
  };
};

/** The actions do not decide the result: no failed answer, no self-assessment, no drawing. */
export class IncompleteAttemptError extends Error {
  readonly attemptId: string;

  constructor(attemptId: string) {
    super(`Attempt ${attemptId} has no action that decides its result`);
    this.attemptId = attemptId;
    this.name = 'IncompleteAttemptError';
  }
}

const isFailure = (evaluation: ValidEvaluation): boolean => evaluation.outcome !== 'correct';

/**
 * The first-attempt outcome, used as the event's evaluation whatever its type. A failure stays a
 * failure even if a later answer is right. Null when the actions decide nothing.
 */
export const firstOutcome = (exercise: EvaluableExercise, reading: AttemptReading): ValidEvaluation | null => {
  if (exercise.format === 'writing') {
    const drawing = reading.firstDrawing;
    if (!drawing) return null;
    if (isFailure(drawing.evaluation)) return drawing.evaluation;
    return drawing.mistakes > WRITING_FROM_MEMORY.hardMaxMistakes ? { outcome: 'incorrect' } : { outcome: 'correct' };
  }
  const answer = reading.firstAnswer;
  const selfRating = reading.firstSelfAssessment?.rating ?? null;
  if (answer && isFailure(answer.evaluation)) return answer.evaluation;
  if (selfRating === 'again') return { outcome: 'incorrect' };
  if (answer || selfRating) return { outcome: 'correct' };
  return null;
};

/** The FSRS rating the actions earn on the item's rating task. Null when they decide nothing. */
export const deriveRating = (task: RatingTask, reading: AttemptReading): Rating | null =>
  task === 'writing' ? writingRating(reading) : meaningRating(reading);

const meaningRating = (reading: AttemptReading): Rating | null => {
  const answer = reading.firstAnswer;
  // The first failure decides, even if a retry ends well.
  if (answer && isFailure(answer.evaluation)) return 'again';
  const selfRating = reading.firstSelfAssessment?.rating ?? null;
  if (!selfRating) return null;
  // Hard and up need an autonomous correct recall.
  if (reading.revealingHintFirst) return 'again';
  return selfRating;
};

const writingRating = (reading: AttemptReading): Rating | null => {
  const drawing = reading.firstDrawing;
  if (!drawing) return null;
  // Every stroke hint shows part of the character, so any hint is Again.
  if (reading.anyHint) return WRITING_FROM_MEMORY.hintRating;
  if (isFailure(drawing.evaluation)) return 'again';
  if (drawing.mistakes <= WRITING_FROM_MEMORY.goodMaxMistakes) return 'good';
  if (drawing.mistakes <= WRITING_FROM_MEMORY.hardMaxMistakes) return 'hard';
  return 'again';
};

/** "Ya la sé" writes Good on a clean correct recall. Hard is not a claim to already know the word. */
export const alreadyKnownHolds = (rating: Rating | null): boolean => rating === 'good' || rating === 'easy';

/**
 * How an exercise can check a "Ya la sé" claim: `meaning` is the rating task, free recall rated by
 * the learner; `recognition` is the meaning among options, graded by the app. Null for any other.
 */
export type ClaimCheck = 'meaning' | 'recognition';

export const claimCheckOf = (itemId: ItemId, exercise: EvaluableExercise): ClaimCheck | null => {
  if (ratingTaskOf(itemId, exercise) === 'meaning') return 'meaning';
  if (
    itemKind(itemId) === 'word-meaning' &&
    exercise.skill === 'meaning' &&
    exercise.format === 'multiple-choice' &&
    exercise.grading === 'automatic' &&
    exercise.cue === 'characters'
  ) return 'recognition';
  return null;
};

/**
 * Whether the actions hold the claim. Recall: a clean Good or Easy. Recognition: the first pick is
 * right and no hint came before it. Null when the actions decide nothing yet.
 */
export const claimHolds = (check: ClaimCheck, reading: AttemptReading): boolean | null => {
  if (check === 'meaning') {
    const rating = meaningRating(reading);
    return rating === null ? null : alreadyKnownHolds(rating);
  }
  const answer = reading.firstAnswer;
  if (!answer) return null;
  return answer.evaluation.outcome === 'correct' && !reading.anyHint;
};
