// Backup of the learning log. This module validates a file, plans a merge or a replace, and reads the
// older file shapes the backup screen still accepts. It touches no storage, Solid or clock.
export { err, ok, type BackupError, type BackupErrorCode, type Result } from './errors.ts';
export { createBackup, isConfigId, isItemId, isLocalDay, parseBackup, parseBackupValue, serializeBackup } from './parse.ts';
export { highestSequence, planMerge, planReplace, type LearningLog, type MergePlan, type ReplacePlan } from './plan.ts';
export { parseUserBackup, type BackupWarning, type UserBackup } from './combined.ts';
