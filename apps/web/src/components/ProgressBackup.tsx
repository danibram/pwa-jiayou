import { parseUserBackup, serializeBackup } from '@jiayou/learning/backup';
import type { LearningStore } from '../stores/learningStore';
import LearningBackup, { type BackupWriteResult } from './learning/backup/LearningBackup';
import { useLearningStore } from './LearningStoreContext';

/** The backup file: the learning log of words and characters, with its scheduler configs. */
export const exportUserBackup = async (store: LearningStore): Promise<string> => serializeBackup(await store.exportBackup());

/**
 * Applies a backup file through the learning store, which rejects an invalid log whole and changes
 * nothing. Merge adds events, replace swaps the log. An older file's v4 progress is never imported;
 * its warning says so, and a v4 file alone changes nothing.
 */
export const applyUserBackup = async (store: LearningStore, raw: string, replace: boolean): Promise<BackupWriteResult> => {
  const parsed = parseUserBackup(raw);
  if (!parsed.ok) return { ok: false, errors: parsed.error };
  const backup = parsed.value;
  const warnings = backup.warnings.map((warning) => warning.message);
  if (!backup.learning) return { ok: true, added: 0, warnings };
  const added = replace ? (await store.replaceBackup(backup.learning)).events : (await store.mergeBackup(backup.learning)).added;
  return { ok: true, added, warnings };
};

/** The backup section of Opciones. */
export default function ProgressBackup() {
  const store = useLearningStore();
  return (
    <LearningBackup
      exportBackup={() => exportUserBackup(store)}
      mergeBackup={(raw) => applyUserBackup(store, raw, false)}
      replaceBackup={(raw) => applyUserBackup(store, raw, true)}
    />
  );
}
