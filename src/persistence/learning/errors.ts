import type { BackupError } from '../../domain/learning/backup';
import type { AttemptEventError } from '../../domain/learning/evaluation';
import { CorruptLogError, InvalidSchedulerConfigError } from '../../domain/learning/scheduler';

/** Why a write was refused. Retrying the same input fails the same way. */
export type RejectReason =
  /** A commit whose event id is already stored with another content. */
  | 'conflicting-event'
  /** A commit for an attempt id that already has an event. */
  | 'duplicate-attempt'
  /** An event the backup parser (`backupErrors`) or `validateAttemptEvent` (`errors`) refuses. */
  | 'invalid-event'
  /** A void whose target is missing, cannot be voided, or belongs to another item. */
  | 'invalid-void'
  /** A config the scheduler adapter refuses, or two configs under one id. */
  | 'invalid-config'
  /** A state or session that does not fit the write (wrong item, wrong schema). */
  | 'invalid-input'
  /** A backup or batch `planMerge`, `planReplace` or `parseBackupValue` refuses (see `backupErrors`). */
  | 'invalid-backup';

/**
 * Every failure the learning repository reports. The UI shows a message per kind; `retryable` kinds
 * may succeed if the same call runs again. A failed write never leaves part of itself behind.
 */
export type StorageError =
  /** The browser refused to store more. Freeing space and retrying may work. */
  | { kind: 'quota-exceeded'; message: string }
  /** The transaction was aborted (another tab, a closed connection, a browser hiccup). Retry. */
  | { kind: 'aborted'; message: string }
  /**
   * The item's stored state is not the one the answer was evaluated against: another tab wrote to it.
   * Nothing was written. Reload the state, evaluate again and retry.
   */
  | { kind: 'stale-state'; message: string; itemId: string }
  /** IndexedDB is missing, blocked or was closed by a reset in another tab. Reload. */
  | { kind: 'unavailable'; message: string }
  | {
      kind: 'rejected';
      reason: RejectReason;
      message: string;
      eventId?: string;
      /** From `validateAttemptEvent`. */
      errors?: readonly AttemptEventError[];
      /** From the backup module, with Spanish messages the backup screen can show. */
      backupErrors?: readonly BackupError[];
    }
  /** The stored log cannot be rebuilt (`CorruptLogError`) or broke an index constraint. */
  | { kind: 'corrupt-log'; reason: CorruptLogError['reason'] | 'constraint'; message: string }
  | { kind: 'unknown'; message: string };

const RETRYABLE: ReadonlySet<StorageError['kind']> = new Set(['quota-exceeded', 'aborted', 'stale-state', 'unavailable']);

export class LearningStorageError extends Error {
  override name = 'LearningStorageError';
  /** The browser or domain error behind it. `Error.cause` is not in the ES2020 lib this project targets. */
  readonly cause: unknown;
  constructor(
    readonly error: StorageError,
    options: { cause?: unknown } = {},
  ) {
    super(error.message);
    this.cause = options.cause;
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.error.kind);
  }
}

export const isLearningStorageError = (value: unknown): value is LearningStorageError => value instanceof LearningStorageError;

export const rejected = (
  reason: RejectReason,
  message: string,
  extra: { eventId?: string; errors?: readonly AttemptEventError[]; backupErrors?: readonly BackupError[] } = {},
): LearningStorageError => new LearningStorageError({ kind: 'rejected', reason, message, ...extra });

const errorName = (error: unknown): string | undefined =>
  error && typeof error === 'object' && 'name' in error && typeof error.name === 'string' ? error.name : undefined;

const errorMessage = (error: unknown): string =>
  error instanceof Error || (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string')
    ? String((error as { message: string }).message) || String(errorName(error) ?? 'Unknown storage error')
    : String(error);

/** Maps whatever a transaction threw to a `LearningStorageError`. Already-typed errors pass through. */
export const toStorageError = (error: unknown): LearningStorageError => {
  if (error instanceof LearningStorageError) return error;
  if (error instanceof CorruptLogError) {
    return new LearningStorageError({ kind: 'corrupt-log', reason: error.reason, message: error.message }, { cause: error });
  }
  if (error instanceof InvalidSchedulerConfigError) {
    return new LearningStorageError({ kind: 'rejected', reason: 'invalid-config', message: error.message }, { cause: error });
  }
  const message = errorMessage(error);
  switch (errorName(error)) {
    case 'QuotaExceededError':
      return new LearningStorageError({ kind: 'quota-exceeded', message }, { cause: error });
    case 'AbortError':
    case 'TransactionInactiveError':
    case 'TimeoutError':
      return new LearningStorageError({ kind: 'aborted', message }, { cause: error });
    case 'InvalidStateError':
    case 'UnknownError':
    case 'VersionError':
    case 'SecurityError':
      return new LearningStorageError({ kind: 'unavailable', message }, { cause: error });
    case 'ConstraintError':
      return new LearningStorageError({ kind: 'corrupt-log', reason: 'constraint', message }, { cause: error });
    default:
      return new LearningStorageError({ kind: 'unknown', message }, { cause: error });
  }
};
