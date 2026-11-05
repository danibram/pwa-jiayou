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
export const evaluatorVersion = 'learning-evaluator@1';

/** Versions whose rules `validateAttemptEvent` can check. An event under any other version is rejected. */
export const SUPPORTED_EVALUATOR_VERSIONS: readonly string[] = [evaluatorVersion];
