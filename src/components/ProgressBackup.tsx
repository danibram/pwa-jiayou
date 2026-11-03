import { createSignal, Show } from 'solid-js';
import { parseProgress, progressStore } from '../stores/progressStore';
import { myWordsStore } from '../stores/myWordsStore';
import { notifyProgressReset } from '../utils/progressReset';
import { isRecord } from '../utils/parse';
import { discardSession } from '../utils/sessionStore';
import { discardAllVocabularySessions } from '../utils/vocabularySession';

/** The progress file, with the learner's own word list alongside. Older files have no `myWords`. */
const backupFile = () => JSON.stringify({ ...JSON.parse(progressStore.exportBackup()), myWords: myWordsStore.exportData() });

const downloadBackup = () => {
  const url = URL.createObjectURL(new Blob([backupFile()], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'jiayou-progreso.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const signalProgressReplaced = () => {
  discardSession();
  discardAllVocabularySessions();
  notifyProgressReset();
};

export function ProgressStorageNotice() {
  const [confirmRecovery, setConfirmRecovery] = createSignal(false);
  const recoverStored = () => {
    if (progressStore.recoverStoredProgress()) {
      signalProgressReplaced();
      setConfirmRecovery(false);
    }
  };
  return (
    <Show when={progressStore.storageError() || myWordsStore.storageError()}>
      {(error) => (
        <aside role="alert" class="sheet fixed inset-x-4 top-4 z-50 mx-auto max-w-md p-4 text-ink">
          <p class="font-semibold">Problema al guardar el progreso</p>
          <p class="mt-1 text-sm text-ink-soft">{typeof error() === 'string' ? error() : 'No se pudieron guardar tus palabras. Exporta una copia antes de cerrar la app.'}</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" class="btn-ink h-11 px-4 text-sm" onClick={() => { if (progressStore.storageError()) progressStore.retrySave(); if (myWordsStore.storageError()) myWordsStore.retrySave(); }}>Reintentar</button>
            <button type="button" class="btn-quiet h-11 px-4 text-sm" onClick={downloadBackup}>Exportar copia</button>
            <Show when={progressStore.storageError()}><button type="button" class="btn-quiet h-11 px-4 text-sm" onClick={() => setConfirmRecovery(true)}>Recuperar progreso guardado</button></Show>
          </div>
          <Show when={confirmRecovery()}>
            <div class="mt-3 border-t border-line pt-3">
              <p class="text-sm text-ink-soft">Esto reemplazará el progreso actual con los datos guardados. Exporta el progreso actual primero si quieres conservarlo.</p>
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

export default function ProgressBackup() {
  const [message, setMessage] = createSignal('');
  const [pending, setPending] = createSignal<string>();
  const [backupCounts, setBackupCounts] = createSignal({ chars: 0, words: 0 });
  let readRequest = 0;
  const chooseFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    const requestId = ++readRequest;
    setPending(undefined);
    setMessage('');
    if (!file) return;
    try {
      const text = await file.text();
      if (requestId !== readRequest) return;
      // Validate before asking the user to replace their progress.
      const parsed = parseProgress(text);
      const saved: unknown = JSON.parse(text);
      if (isRecord(saved) && saved.myWords !== undefined) myWordsStore.checkData(saved.myWords);
      setBackupCounts({ chars: Object.keys(parsed.chars).length, words: Object.keys(parsed.words).length });
      setPending(text);
      setMessage('');
    } catch {
      if (requestId !== readRequest) return;
      setPending(undefined);
      setMessage('No se pudo leer la copia. Comprueba que sea un archivo de progreso válido.');
    }
  };
  const restore = () => {
    const raw = pending();
    if (!raw) return;
    try {
      // Check the word list before anything is replaced, so a bad file changes nothing.
      const saved: unknown = JSON.parse(raw);
      const myWords = isRecord(saved) && saved.myWords !== undefined ? myWordsStore.checkData(saved.myWords) : undefined;
      progressStore.importBackup(raw);
      if (myWords) myWordsStore.importData(myWords);
      signalProgressReplaced();
      setMessage('Copia restaurada.');
      setPending(undefined);
    } catch {
      setMessage('No se pudo guardar la copia. Tu progreso actual sigue disponible.');
    }
  };
  return (
    <section class="sheet mt-5 p-4">
      <h2 class="font-display text-lg font-semibold">Copia de seguridad</h2>
      <p class="mt-2 text-sm leading-relaxed text-ink-soft">Guarda tu historial de aprendizaje en un archivo para recuperarlo más adelante.</p>
      <div class="mt-3 flex flex-wrap gap-2">
        <button type="button" class="btn-ink h-11 px-4 text-sm" onClick={downloadBackup}>Exportar progreso</button>
        <label class="btn-quiet relative inline-flex h-11 cursor-pointer items-center px-4 text-sm focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink">
          Importar copia
          <input type="file" accept="application/json,.json" class="absolute inset-0 h-full w-full cursor-pointer opacity-0" onChange={(event) => {
            const input = event.currentTarget;
            if (input instanceof HTMLInputElement) void chooseFile(input);
          }} />
        </label>
      </div>
      <Show when={pending()}>
        <div class="mt-3">
          <p class="text-sm text-ink-soft">La copia reemplazará el progreso actual. Contiene {backupCounts().chars} {backupCounts().chars === 1 ? 'registro' : 'registros'} de caracteres y {backupCounts().words} de palabras. Exporta el progreso actual primero si quieres conservarlo.</p>
          <div class="mt-2 flex gap-2">
            <button type="button" class="btn-ink h-11 px-4 text-sm" onClick={restore}>Reemplazar progreso</button>
            <button type="button" class="btn-quiet h-11 px-4 text-sm" onClick={() => setPending(undefined)}>Cancelar</button>
          </div>
        </div>
      </Show>
      <Show when={message()}><p role="status" class="mt-3 text-sm">{message()}</p></Show>
    </section>
  );
}
