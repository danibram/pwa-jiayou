import type { AttemptEventErrorCode } from '../evaluation/index.ts';

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });
export const err = <E>(error: E): { ok: false; error: E } => ({ ok: false, error });

export type BackupErrorCode =
  /** The text is not JSON. */
  | 'invalid-json'
  /** A field is missing, has the wrong type or value, or is not part of the format. */
  | 'invalid-format'
  /** A `schemaVersion` or `version` this code does not read. */
  | 'unsupported-version'
  /** An item id that does not match the content it cites. */
  | 'item-content-mismatch'
  /** One event id with two different contents. */
  | 'conflicting-event'
  /** Two attempt events with the same attempt id and different event ids. */
  | 'duplicate-attempt'
  /** One config id with two different configs. */
  | 'conflicting-config'
  /** A config that does not hash to its own id. */
  | 'config-hash-mismatch'
  /** A config written for another ts-fsrs version. */
  | 'package-version'
  /** A config the scheduler adapter would refuse. */
  | 'invalid-config'
  /** A scheduled review citing a config that neither side carries. */
  | 'unknown-config'
  | 'void-target-missing'
  /** A void aimed at an exposure or another void. */
  | 'void-target-not-voidable'
  | 'void-item-mismatch'
  /** An attempt event the evaluator rules reject; `attemptCode` says which rule. */
  | 'invalid-attempt-event';

/** Messages are Spanish because the backup screen may show them. */
export interface BackupError {
  code: BackupErrorCode;
  message: string;
  /** Where in the file, as `events[3].exercise.cue`. */
  path?: string;
  eventId?: string;
  configId?: string;
  attemptCode?: AttemptEventErrorCode;
}
