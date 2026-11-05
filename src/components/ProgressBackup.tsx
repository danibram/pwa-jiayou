import { createSignal, Show } from 'solid-js';
import {
  legacyCharactersToProgressFile,
  parseLegacyProgressFile,
  parseUserBackup,
  serializeCombinedBackup,
} from '../domain/learning/backup';
import { progressStore } from '../stores/progressStore';
import type { LearningStore } from '../stores/learningStore';
import LearningBackup, { type BackupWriteResult } from './learning/backup/LearningBackup';
import { useLearningStore } from './LearningStoreContext';

/**
 * The backup file until phase 5C: the learning log for words, and the v4 records for characters,
 * which still live in `progressStore`.
 */
export const exportCombinedBackup = async (store: LearningStore): Promise<string> => {
  const legacy = parseLegacyProgressFile(progressStore.exportBackup());
  if (!legacy.ok) throw new Error('The character progress could not be read');
  return serializeCombinedBackup({ learning: await store.exportBackup(), legacyCharacters: legacy.value.legacyCharacters });
};

/**
 * Applies a backup file. The learning half goes first, through the learning store, which rejects an
 * invalid log whole and changes nothing. The character half then goes through `progressStore`, which
 * only fails when localStorage refuses the write; the words stay imported and a warning says so.
 * Merge adds, replace swaps; a file without one half leaves that half of this device alone.
 */
export const applyCombinedBackup = async (store: LearningStore, raw: string, replace: boolean): Promise<BackupWriteResult> => {
  const parsed = parseUserBackup(raw);
  if (!parsed.ok) return { ok: false, errors: parsed.error };
  const backup = parsed.value;
  const warnings = backup.warnings.map((warning) => warning.message);
  let added = 0;
  if (backup.learning) {
    if (replace) added = (await store.replaceBackup(backup.learning)).events;
    else added = (await store.mergeBackup(backup.learning)).added;
  }
  if (backup.legacyCharacters) {
    const file = legacyCharactersToProgressFile(backup.legacyCharacters);
    // Characters this device has never studied: the merge's new records.
    const fresh = Object.keys(backup.legacyCharacters.chars).filter((char) => !progressStore.get(char)).length;
    try {
      if (replace) progressStore.importBackup(file);
      else progressStore.mergeBackup(file);
      added += fresh;
    } catch (error) {
      if (!backup.learning) throw error;
      warnings.push('No se pudo guardar el progreso de los caracteres en este dispositivo. El de las palabras sí se ha guardado.');
    }
  }
  return { ok: true, added, warnings };
};

const download = (text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'jiayou-progreso.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

/** Shown over every screen when the character progress cannot be saved in localStorage. */
export function ProgressStorageNotice() {
  const store = useLearningStore();
  const [confirmRecovery, setConfirmRecovery] = createSignal(false);
  const [exportFailed, setExportFailed] = createSignal(false);
  const recoverStored = () => {
    if (progressStore.recoverStoredProgress()) setConfirmRecovery(false);
  };
  const exportNow = () => {
    setExportFailed(false);
    exportCombinedBackup(store).then(download, () => setExportFailed(true));
  };
  return (
    <Show when={progressStore.storageError()}>
      {(error) => (
        <aside role="alert" class="sheet fixed inset-x-4 top-4 z-50 mx-auto max-w-md p-4 text-ink">
          <p class="font-semibold">Problema al guardar el progreso</p>
          <p class="mt-1 text-sm text-ink-soft">{typeof error() === 'string' ? error() : 'No se pudo guardar el progreso de los caracteres. Exporta una copia antes de cerrar la app.'}</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" class="btn-ink h-11 px-4 text-sm" onClick={() => progressStore.retrySave()}>Reintentar</button>
            <button type="button" class="btn-quiet h-11 px-4 text-sm" onClick={exportNow}>Exportar copia</button>
            <button type="button" class="btn-quiet h-11 px-4 text-sm" onClick={() => setConfirmRecovery(true)}>Recuperar progreso guardado</button>
          </div>
          <Show when={exportFailed()}><p class="mt-2 text-sm text-seal">No se pudo exportar la copia.</p></Show>
          <Show when={confirmRecovery()}>
            <div class="mt-3 border-t border-line pt-3">
              <p class="text-sm text-ink-soft">Esto reemplazará el progreso actual de los caracteres con los datos guardados. Exporta primero si quieres conservarlo.</p>
              <div class="mt-2 flex gap-2">
                <button type="button" class="btn-ink h-11 px-4 text-sm" onClick={recoverStored}>Usar progreso guardado</button>
                <button type="button" class="btn-quiet h-11 px-4 text-sm" onClick={() => setConfirmRecovery(false)}>Cancelar</button>
              </div>
            </div>
          </Show>
        </aside>
      )}
    </Show>
  );
}

/** The backup section of Opciones: one file with words and characters. */
export default function ProgressBackup() {
  const store = useLearningStore();
  return (
    <LearningBackup
      exportBackup={() => exportCombinedBackup(store)}
      mergeBackup={(raw) => applyCombinedBackup(store, raw, false)}
      replaceBackup={(raw) => applyCombinedBackup(store, raw, true)}
    />
  );
}
