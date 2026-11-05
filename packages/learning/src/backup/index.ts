// Backup of the learning log. This module validates a file, plans a merge or a replace, and reads the
// older file shapes the backup screen still accepts. It touches no storage, Solid or clock.
export { err, ok, type BackupError, type BackupErrorCode, type Result } from './errors';
export { createBackup, isConfigId, isItemId, isLocalDay, parseBackup, parseBackupValue, serializeBackup } from './parse';
export { highestSequence, planMerge, planReplace, type LearningLog, type MergePlan, type ReplacePlan } from './plan';
export { parseUserBackup, type BackupWarning, type UserBackup } from './combined';
