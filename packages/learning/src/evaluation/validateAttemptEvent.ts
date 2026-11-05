import { regradeTypedAnswers } from '../production/grade.ts';
import { SESSION_MODE_RATES, type LearningEvent, type ValidEvaluation } from '../types.ts';
import { alreadyKnownHolds, claimCheckOf, claimHolds, deriveRating, findInvalid, firstOutcome, ratingTaskOf, readAttempt } from './rules.ts';
import { RECOGNITION_CLAIM_CHECK, REVEAL_BEFORE_SELF_ASSESSMENT, SUPPORTED_EVALUATOR_VERSIONS } from './version.ts';

export type AttemptEventErrorCode =
  /** Written under rules this validator does not know, so it cannot check them. */
  | 'unknown-evaluator-version'
  /** A practice or scheduled review carries an invalid evaluation in its actions. */
  | 'invalid-action-in-valid-event'
  /** The event's own evaluation has the wrong kind for its type. */
  | 'evaluation-kind'
  /** The actions decide no result. */
  | 'incomplete-actions'
  /** The event's evaluation differs from the first outcome of its actions. */
  | 'evaluation-mismatch'
  /** A scheduled review written by a mode that never rates. */
  | 'mode-does-not-rate'
  /** A scheduled review from an exercise that is not the item's rating task. */
  | 'exercise-cannot-rate'
  /** The rating is not the one the actions earn. */
  | 'rating-mismatch'
  /** Hard, Good or Easy without a correct recall. */
  | 'rating-without-correct-recall'
  /** An "already known" review that is not a clean Good on the meaning task. */
  | 'already-known-not-good'
  | 'unknown-basis'
  /** Evidence on an invalid attempt, or evidence with an invalid evaluation. */
  | 'invalid-evidence'
  /** A self-assessment before the answer was revealed (from `learning-evaluator@3`). */
  | 'self-assessment-without-reveal';

export interface AttemptEventError {
  eventId: string;
  code: AttemptEventErrorCode;
  message: string;
}

const VALID_OUTCOMES = new Set(['correct', 'partial', 'incorrect', 'unanswered']);
const RATINGS = new Set(['again', 'hard', 'good', 'easy']);
const isValidEvaluation = (evaluation: { outcome: string } | null | undefined): evaluation is ValidEvaluation =>
  !!evaluation && VALID_OUTCOMES.has(evaluation.outcome);

/**
 * Checks that a stored or imported attempt event follows the evaluator rules its version names.
 * The types allow events such as "wrong answer, hint, right answer" rated Good; this rejects them.
 * Exposures and voids have no actions to check and always pass. Eligibility is not checked: it
 * depends on the item's history, which the rebuild replays.
 *
 * Event data from storage or a backup is untrusted, so the checks do not rely on the static types.
 * Typed answers are graded again from their text, as `evaluateAttempt` does, before any check.
 */
export const validateAttemptEvent = (event: LearningEvent): AttemptEventError[] => {
  if (event.type === 'exposure' || event.type === 'attempt-voided') return [];
  const errors: AttemptEventError[] = [];
  const fail = (code: AttemptEventErrorCode, message: string) => errors.push({ eventId: event.id, code, message });

  if (!SUPPORTED_EVALUATOR_VERSIONS.includes(event.evaluatorVersion)) {
    fail('unknown-evaluator-version', `Evaluator version ${String(event.evaluatorVersion)} is not supported`);
    return errors;
  }

  if (event.type === 'invalid-attempt') {
    if (event.evaluation?.outcome !== 'invalid') fail('evaluation-kind', 'An invalid attempt needs an invalid evaluation');
    if (event.evidence.length > 0) fail('invalid-evidence', 'An invalid attempt carries no evidence');
    return errors;
  }

  if (!isValidEvaluation(event.evaluation)) fail('evaluation-kind', `A ${event.type} event needs a valid evaluation`);
  for (const evidence of event.evidence) {
    if (!isValidEvaluation(evidence.evaluation)) fail('invalid-evidence', `Evidence ${evidence.id} has no valid evaluation`);
  }
  const actions = regradeTypedAnswers(event.exercise, event.actions);
  if (findInvalid(actions)) {
    fail('invalid-action-in-valid-event', `A ${event.type} event cannot contain an invalid answer`);
    return errors;
  }

  if (REVEAL_BEFORE_SELF_ASSESSMENT.includes(event.evaluatorVersion) && event.exercise.grading === 'self-assessment') {
    const rated = actions.findIndex((action) => action.type === 'self-assessment');
    const revealed = actions.findIndex((action) => action.type === 'reveal');
    if (rated >= 0 && (revealed < 0 || revealed > rated)) {
      fail('self-assessment-without-reveal', 'A self-assessment needs the answer revealed first');
    }
  }

  const reading = readAttempt(event.exercise, actions);
  const outcome = firstOutcome(event.exercise, reading);
  if (!outcome) {
    fail('incomplete-actions', 'The actions decide no result');
    return errors;
  }
  if (isValidEvaluation(event.evaluation) && event.evaluation.outcome !== outcome.outcome) {
    fail('evaluation-mismatch', `Evaluation ${event.evaluation.outcome} but the first outcome is ${outcome.outcome}`);
  }
  if (event.type === 'practice') return errors;

  if (!RATINGS.has(event.rating)) fail('rating-mismatch', `Unknown rating ${String(event.rating)}`);
  if (event.rating !== 'again' && event.evaluation?.outcome !== 'correct') {
    fail('rating-without-correct-recall', `Rating ${event.rating} needs a correct evaluation`);
  }
  if (!SESSION_MODE_RATES[event.sessionMode]) fail('mode-does-not-rate', `Mode ${event.sessionMode} never rates`);

  // A "Ya la sé" check among options rates no task of its own: the claim either holds or it does not.
  if (event.basis === 'already-known' && RECOGNITION_CLAIM_CHECK.includes(event.evaluatorVersion) && claimCheckOf(event.itemId, event.exercise) === 'recognition') {
    if (event.rating !== 'good' || claimHolds('recognition', reading) !== true) {
      fail('already-known-not-good', 'An already-known review among options needs a right first pick with no hint');
    }
    return errors;
  }

  const task = ratingTaskOf(event.itemId, event.exercise);
  if (!task) {
    fail('exercise-cannot-rate', `Exercise ${event.exercise.id} cannot rate ${event.itemId}`);
    return errors;
  }
  const earned = deriveRating(task, reading);
  if (!earned) {
    fail('incomplete-actions', 'The actions earn no rating');
    return errors;
  }

  switch (event.basis) {
    case 'due':
      if (earned !== event.rating) fail('rating-mismatch', `Rating ${event.rating} but the actions earn ${earned}`);
      break;
    case 'already-known':
      if (task !== 'meaning' || event.rating !== 'good' || !alreadyKnownHolds(earned)) {
        fail('already-known-not-good', `An already-known review must be a clean Good, the actions earn ${earned}`);
      }
      break;
    default:
      fail('unknown-basis', `Unknown basis ${String((event as { basis: unknown }).basis)}`);
  }
  return errors;
};
