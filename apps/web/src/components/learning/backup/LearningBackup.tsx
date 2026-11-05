import { Component, For, Show, createSignal } from 'solid-js';
import { parseUserBackup, type UserBackup } from '@jiayou/learning/backup';

export type BackupWriteResult =
  | { ok: true; added: number; warnings: string[] }
  | { ok: false; errors: { message: string }[] };

export interface LearningBackupProps {
  /** The learning backup file as text: the event log and its scheduler configs. */
  exportBackup(): Promise<string>;
  /** Adds what the file has and this device lacks. Never removes anything. */
  mergeBackup(raw: string): Promise<BackupWriteResult>;
  /** Swaps this device's progress for the file's. */
  replaceBackup(raw: string): Promise<BackupWriteResult>;
  /** Name of the downloaded file. */
  fileName?: string;
}

/** Errors listed before the rest are summed up, so a broken file does not fill the screen. */
const MAX_ERRORS = 5;

/** Larger files are refused before reading: a year of daily study is a few megabytes. */
export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What the file holds, in words. Older v4 progress is never imported; a warning counts it. */
const describe = (backup: UserBackup): string =>
  backup.learning
    ? `La copia tiene ${plural(backup.learning.events.length, 'registro de aprendizaje', 'registros de aprendizaje')}.`
    : 'La copia es del formato antiguo y no trae progreso que importar.';

type Message = { text: string; details: string[] };

/** Backup for the learning log: export, merge by default, and replace after a second confirmation. */
const LearningBackup: Component<LearningBackupProps> = (props) => {
  const [message, setMessage] = createSignal<Message | null>(null);
  const [pending, setPending] = createSignal<{ raw: string; summary: string; warnings: string[] }>();
  const [confirmReplace, setConfirmReplace] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  let readRequest = 0;

  const say = (text: string, details: string[] = []) => setMessage({ text, details });
  const listErrors = (errors: { message: string }[]) => {
    const shown = errors.slice(0, MAX_ERRORS).map((error) => error.message);
    if (errors.length > MAX_ERRORS) shown.push(`Y ${plural(errors.length - MAX_ERRORS, 'error más', 'errores más')}.`);
    return shown;
  };

  const download = async () => {
    if (busy()) return;
    setBusy(true);
    try {
      const text = await props.exportBackup();
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = props.fileName ?? 'jiayou-progreso.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      say('No se pudo exportar la copia. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const chooseFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    const requestId = ++readRequest;
    setPending(undefined);
    setConfirmReplace(false);
    setMessage(null);
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      say('El archivo es demasiado grande para ser una copia de progreso (más de 100 MB). Tu progreso no ha cambiado.');
      return;
    }
    let raw: string;
    try {
      raw = await file.text();
    } catch {
      if (requestId === readRequest) say('No se pudo leer el archivo. Tu progreso no ha cambiado.');
      return;
    }
    if (requestId !== readRequest) return;
    // Validate before offering to write anything.
    const parsed = parseUserBackup(raw);
    if (!parsed.ok) {
      say('Esta copia no es válida. Tu progreso no ha cambiado.', listErrors(parsed.error));
      return;
    }
    setPending({ raw, summary: describe(parsed.value), warnings: parsed.value.warnings.map((warning) => warning.message) });
  };

  const write = async (replace: boolean) => {
    const file = pending();
    if (!file || busy()) return;
    setBusy(true);
    try {
      const result = replace ? await props.replaceBackup(file.raw) : await props.mergeBackup(file.raw);
      if (!result.ok) {
        say('No se pudo usar la copia. Tu progreso no ha cambiado.', listErrors(result.errors));
        return;
      }
      const text = replace
        ? 'Copia restaurada.'
        : result.added === 0
          ? 'Copia combinada. No traía nada que no tuvieras ya.'
          : `Copia combinada con tu progreso. ${plural(result.added, 'registro nuevo', 'registros nuevos')}.`;
      say(text, result.warnings);
      setPending(undefined);
      setConfirmReplace(false);
    } catch {
      say('No se pudo guardar la copia. Tu progreso actual sigue disponible.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setPending(undefined);
    setConfirmReplace(false);
  };

  return (
    <section class="sheet mt-5 p-4">
      <h2 class="font-display text-lg font-semibold">Copia de seguridad</h2>
      <p class="mt-2 text-sm leading-relaxed text-ink-soft">Guarda tu historial de aprendizaje en un archivo para recuperarlo más adelante o llevarlo a otro dispositivo.</p>
      <div class="mt-3 flex flex-wrap gap-2">
        <button type="button" class="btn-ink h-11 px-4 text-sm" disabled={busy()} onClick={() => void download()}>Exportar progreso</button>
        <label class="btn-quiet relative inline-flex h-11 cursor-pointer items-center px-4 text-sm focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink">
          Importar copia
          <input type="file" accept="application/json,.json" class="absolute inset-0 h-full w-full cursor-pointer opacity-0" onChange={(event) => {
            const input = event.currentTarget;
            if (input instanceof HTMLInputElement) void chooseFile(input);
          }} />
        </label>
      </div>
      <Show when={pending()}>
        {(file) => (
          <div class="mt-3">
            <p class="text-sm text-ink-soft">{file().summary} Combinarla añade lo que falte en este dispositivo y no borra nada.</p>
            <Show when={file().warnings.length > 0}>
              <ul class="mt-2 list-disc pl-5 text-sm text-ink-soft">
                <For each={file().warnings}>{(warning) => <li>{warning}</li>}</For>
              </ul>
            </Show>
            <Show
              when={confirmReplace()}
              fallback={
                <div class="mt-2 flex flex-wrap gap-2">
                  <button type="button" class="btn-ink h-11 px-4 text-sm" disabled={busy()} onClick={() => void write(false)}>Combinar con mi progreso</button>
                  <button type="button" class="btn-quiet h-11 px-4 text-sm" disabled={busy()} onClick={() => setConfirmReplace(true)}>Reemplazar progreso</button>
                  <button type="button" class="btn-quiet h-11 px-4 text-sm" onClick={cancel}>Cancelar</button>
                </div>
              }
            >
              <div class="mt-3 border-t border-line pt-3">
                <p class="text-sm text-ink-soft">Reemplazar borra el progreso de este dispositivo y deja solo el de la copia. Exporta antes si quieres conservarlo.</p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <button type="button" class="btn-ink h-11 px-4 text-sm" disabled={busy()} onClick={() => void write(true)}>Sí, reemplazar</button>
                  <button type="button" class="btn-quiet h-11 px-4 text-sm" onClick={() => setConfirmReplace(false)}>Volver</button>
                </div>
              </div>
            </Show>
          </div>
        )}
      </Show>
      <Show when={message()}>
        {(shown) => (
          <div role="status" class="mt-3 text-sm">
            <p>{shown().text}</p>
            <Show when={shown().details.length > 0}>
              <ul class="mt-1 list-disc pl-5 text-ink-soft">
                <For each={shown().details}>{(detail) => <li>{detail}</li>}</For>
              </ul>
            </Show>
          </div>
        )}
      </Show>
    </section>
  );
};

export default LearningBackup;
