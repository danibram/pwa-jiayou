import { observeAttempt } from '../evidence/observe.ts';
import { regradeTypedAnswers } from '../production/grade.ts';
import { SESSION_MODE_RATES } from '../types.ts';
import {
  IncompleteAttemptError,
  alreadyKnownHolds,
  deriveRating,
  findInvalid,
  firstOutcome,
  ratingTaskOf,
  readAttempt,
} from './rules.ts';
import type { AttemptInput, EvaluableExercise, EvaluationContext, EvaluationResult, PracticeReason } from './types.ts';
import { evaluatorVersion } from './version.ts';

/**
 * Decides which event a submitted attempt writes. Only a `scheduled-review` result may update FSRS.
 *
 * The checks run in this order. An invalid evaluation anywhere makes the attempt `invalid-attempt`
 * with no evidence. A mode that never rates, an exercise that is not the item's rating task, a failed "Ya la sé"
 * check or an item the scheduler does not find eligible make it `practice`; anything else is a
 * `scheduled-review` whose rating comes from the actions. Response times never count.
 *
 * Typed answers on automatic free-recall exercises are graded again from their text with
 * `regradeTypedAnswers`; the evaluation the screen recorded does not count.
 *
 * Throws `IncompleteAttemptError` when a valid attempt has no action that decides its result. That
 * is a session bug, and calling it invalid would hide it.
 */
export const evaluateAttempt = (
  submitted: AttemptInput,
  exercise: EvaluableExercise,
  context: EvaluationContext,
): EvaluationResult => {
  const attempt: AttemptInput = { ...submitted, actions: regradeTypedAnswers(exercise, submitted.actions) };
  const invalid = context.invalidation ?? findInvalid(attempt.actions);
  if (invalid) return { kind: 'invalid-attempt', evaluation: invalid, evidence: [], evaluatorVersion };

  const reading = readAttempt(exercise, attempt.actions);
  const evaluation = firstOutcome(exercise, reading);
  if (!evaluation) throw new IncompleteAttemptError(attempt.id);
  const evidence = observeAttempt(attempt, exercise, reading, evaluation);
  const practice = (reason: PracticeReason): EvaluationResult => ({
    kind: 'practice',
    reason,
    evaluation,
    evidence,
    evaluatorVersion,
  });

  if (!SESSION_MODE_RATES[context.sessionMode]) return practice('session-mode');
  const task = ratingTaskOf(attempt.itemId, exercise);
  if (!task) return practice('exercise');

  const rating = deriveRating(task, reading);
  if (!rating) throw new IncompleteAttemptError(attempt.id);

  if (context.alreadyKnownCheck) {
    if (task !== 'meaning') return practice('exercise');
    if (!alreadyKnownHolds(rating)) return practice('already-known-miss');
    return {
      kind: 'scheduled-review',
      basis: 'already-known',
      rating: 'good',
      evaluation: { outcome: 'correct' },
      evidence,
      evaluatorVersion,
    };
  }
  if (!context.scheduledEligible) return practice('not-eligible');

  if (rating === 'again') {
    return { kind: 'scheduled-review', basis: 'due', rating, evaluation, evidence, evaluatorVersion };
  }
  // Hard, Good and Easy only come from a correct first outcome; `firstOutcome` and the rating agree.
  if (evaluation.outcome !== 'correct') {
    throw new Error(`Rating ${rating} without a correct recall in attempt ${attempt.id}`);
  }
  return { kind: 'scheduled-review', basis: 'due', rating, evaluation, evidence, evaluatorVersion };
};
