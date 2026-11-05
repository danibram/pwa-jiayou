/**
 * Identifies the rules in this folder: how actions become a rating, which exercises may rate, how
 * evidence is built. Every attempt event stores the version that evaluated it.
 *
 * Bump it when the same actions would produce a different event: another rating, another event
 * type, another evaluation or other evidence. Renames, refactors and new tests do not bump it.
 *
 * When bumping, keep the previous version in `SUPPORTED_EVALUATOR_VERSIONS` and keep its rules
 * reachable from `validateAttemptEvent`, so backups written under the old rules still import.
 */
export const evaluatorVersion = 'learning-evaluator@4';

/**
 * Versions whose rules `validateAttemptEvent` can check. An event under any other version is rejected.
 * - `@1`: answers keep the evaluation the screen recorded.
 * - `@2`: typed answers on automatic free-recall exercises are graded again from their text
 *   (`regradeTypedAnswers`). No `@1` event has such an exercise, so the same code checks both.
 * - `@3`: a self-assessment counts only after the answer was revealed. The app never let a learner
 *   rate before revealing, so `@1` and `@2` events it wrote pass either way; they are not checked.
 * - `@4`: the "Ya la sé" check may also be the meaning among options (`recognize`): a first pick
 *   that is right, with no hint, holds the claim.
 */
export const SUPPORTED_EVALUATOR_VERSIONS: readonly string[] = ['learning-evaluator@1', 'learning-evaluator@2', 'learning-evaluator@3', evaluatorVersion];

/** Versions that require a reveal before the first self-assessment. */
export const REVEAL_BEFORE_SELF_ASSESSMENT: readonly string[] = ['learning-evaluator@3', evaluatorVersion];

/** Versions that take the meaning among options as the "Ya la sé" check. */
export const RECOGNITION_CLAIM_CHECK: readonly string[] = [evaluatorVersion];
