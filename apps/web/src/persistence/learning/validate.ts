import { parseBackupValue, type BackupError, type LearningLog } from '../../domain/learning/backup';
import { validateAttemptEvent } from '../../domain/learning/evaluation';
import { canonicalJson } from '../../domain/learning/scheduler';
import type { LearningBackup, LearningEvent, VoidableEventType } from '../../domain/learning/types';
import { rejected } from './errors';

const VOIDABLE: ReadonlySet<string> = new Set<VoidableEventType>(['practice', 'scheduled-review', 'invalid-attempt']);

export const isAttemptEvent = (event: LearningEvent): event is Extract<LearningEvent, { attemptId: string }> => VOIDABLE.has(event.type);

const describe = (errors: readonly BackupError[]) => errors.map((error) => error.message).join(' ');

/**
 * Runs the backup parser over a log, so the repository never stores what an export of it could not
 * import again: shapes, item ids that match their content, and config shapes. Returns the parsed log.
 */
export const parseLog = (log: { deviceId: string; events: unknown; configs: unknown }): LearningLog => {
  const parsed = parseBackupValue({ schemaVersion: 1, exportedAt: 1, deviceId: log.deviceId, events: log.events, configs: log.configs });
  if (!parsed.ok) {
    throw rejected('invalid-backup', describe(parsed.error), { eventId: parsed.error[0]?.eventId, backupErrors: parsed.error });
  }
  return parsed.value;
};

/** Refuses an event the backup parser rejects, or an attempt event the evaluator rules reject. */
export const assertValidEvent = (event: LearningEvent, deviceId: string): void => {
  try {
    parseLog({ deviceId, events: [event], configs: [] });
  } catch (error) {
    const backupErrors = (error as { error?: { backupErrors?: readonly BackupError[] } }).error?.backupErrors ?? [];
    throw rejected('invalid-event', describe(backupErrors), { eventId: event.id, backupErrors });
  }
  const errors = validateAttemptEvent(event);
  if (errors.length > 0) {
    throw rejected('invalid-event', `Event ${event.id}: ${errors.map((e) => e.code).join(', ')}`, { eventId: event.id, errors });
  }
};

/** The comparison for a retried commit: the repository stamped `sequence` on the stored copy. */
export const sameIgnoringSequence = (stored: LearningEvent, incoming: LearningEvent): boolean =>
  canonicalJson({ ...stored, sequence: undefined }) === canonicalJson({ ...incoming, sequence: undefined });

export type { LearningBackup };
