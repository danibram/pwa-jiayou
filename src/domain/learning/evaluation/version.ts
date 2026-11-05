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
export const evaluatorVersion = 'learning-evaluator@2';

/**
 * Versions whose rules `validateAttemptEvent` can check. An event under any other version is rejected.
 * - `@1`: answers keep the evaluation the screen recorded.
 * - `@2`: typed answers on automatic free-recall exercises are graded again from their text
 *   (`regradeTypedAnswers`). No `@1` event has such an exercise, so the same code checks both.
 */
export const SUPPORTED_EVALUATOR_VERSIONS: readonly string[] = ['learning-evaluator@1', evaluatorVersion];
