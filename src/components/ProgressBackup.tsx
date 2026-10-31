import { createSignal, Show } from 'solid-js';
import { progressStore } from '../stores/progressStore';

const downloadBackup = () => {
  const url = URL.createObjectURL(new Blob([progressStore.exportBackup()], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'jiayou-progreso.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

export function ProgressStorageNotice() {
  return (
    <Show when={progressStore.storageError()}>
      {(error) => (
        <aside role="alert" class="sheet fixed inset-x-4 top-4 z-50 mx-auto max-w-md p-4 text-ink">
          <p class="font-semibold">Problema al guardar el progreso</p>
          <p class="mt-1 text-sm text-ink-soft">{error()}</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" class="btn-ink h-11 px-4 text-sm" onClick={() => progressStore.retrySave()}>Reintentar</button>
            <button type="button" class="btn-quiet h-11 px-4 text-sm" onClick={downloadBackup}>Exportar copia</button>
          </div>
        </aside>
      )}
    </Show>
  );
}

export default function ProgressBackup() {
  const [message, setMessage] = createSignal('');
  const [pending, setPending] = createSignal<string>();
  const chooseFile = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      // Validate before asking the user to replace their progress.
      const { parseProgress } = await import('../stores/progressStore');
      parseProgress(text);
      setPending(text);
      setMessage('');
    } catch {
      setPending(undefined);
      setMessage('No se pudo leer la copia. Comprueba que sea un archivo de progreso válido.');
    }
  };
  const restore = () => {
    try {
      progressStore.importBackup(pending()!);
      setMessage('Copia restaurada.');
      setPending(undefined);
    } catch {
      setMessage('No se pudo guardar la copia. Tu progreso actual sigue disponible.');
    }
  };
  return (
    <section class="sheet mt-5 p-4 animate-rise">
      <h2 class="eyebrow">Copia de seguridad</h2>
      <p class="mt-2 text-sm leading-relaxed text-ink-soft">Guarda tu historial de aprendizaje en un archivo para recuperarlo más adelante.</p>
      <div class="mt-3 flex flex-wrap gap-2">
        <button type="button" class="btn-ink h-11 px-4 text-sm" onClick={downloadBackup}>Exportar progreso</button>
        <label class="btn-quiet inline-flex h-11 cursor-pointer items-center px-4 text-sm">
          Importar copia
          <input type="file" accept="application/json,.json" class="sr-only" onChange={chooseFile} />
        </label>
      </div>
      <Show when={pending()}>
        <div class="mt-3">
          <p class="text-sm text-ink-soft">La copia reemplazará el progreso actual. Exporta el progreso actual primero si quieres conservarlo.</p>
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
