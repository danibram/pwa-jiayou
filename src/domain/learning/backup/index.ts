// Backup of the learning log. This module validates a file, plans a merge or a replace, and reads and
// writes the combined file the backup screen uses until phase 5C. It touches no storage, Solid or clock.
export { err, ok, type BackupError, type BackupErrorCode, type Result } from './errors';
export { createBackup, isConfigId, isItemId, isLocalDay, parseBackup, parseBackupValue, serializeBackup } from './parse';
export { highestSequence, planMerge, planReplace, type LearningLog, type MergePlan, type ReplacePlan } from './plan';
export {
  legacyCharactersToProgressFile,
  parseLegacyProgressFile,
  parseUserBackup,
  serializeCombinedBackup,
  type BackupWarning,
  type CombinedBackup,
  type LegacyCharacterProgress,
  type UserBackup,
} from './combined';
