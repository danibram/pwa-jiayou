import { createResource, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { downloadState, saveStudyMedia } from '../utils/levelPacks';
import { contentVersionLabel } from '../data/contentVersion';

export function OfflineDownloadNotice() {
  const [dismissed, setDismissed] = createSignal(false);
  return <Show when={downloadState().state === 'error' && !dismissed()}>
    <aside role="alert" class="sheet fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md p-4 text-ink">
      <p class="font-semibold">Descarga incompleta</p>
      <p class="mt-1 text-sm text-ink-soft">Algunos archivos de tus listas necesitan conexión. Puedes volver a intentarlo en Opciones.</p>
      <div class="mt-3 flex gap-2">
        <button type="button" class="btn-ink h-11 px-4 text-sm" onClick={() => { setDismissed(false); void saveStudyMedia(); }}>Reintentar</button>
        <button type="button" class="btn-quiet h-11 px-4 text-sm" onClick={() => setDismissed(true)}>Cerrar</button>
      </div>
    </aside>
  </Show>;
}

async function inspectStorage() {
  try {
  if (!('caches' in window)) return null;
  const names = await caches.keys();
  const lists = await Promise.all(names.map(async (name) => (await caches.open(name)).keys()));
  const paths = [...new Set(lists.flat().map((request) => new URL(request.url).pathname))];
  const groups = [
    { label: 'Audios', paths: paths.filter((path) => path.startsWith('/audio/')) },
    { label: 'Trazos', paths: paths.filter((path) => path.startsWith('/strokes/')) },
    { label: 'Otros recursos', paths: paths.filter((path) => !path.startsWith('/audio/') && !path.startsWith('/strokes/')) },
  ];
  const usage = await navigator.storage?.estimate?.().catch(() => undefined);
  const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  return { groups, usage: usage?.usage, waiting: !!registration?.waiting, installing: !!registration?.installing };
  } catch {
    return null;
  }
}

export default function OfflineStatus() {
  const [status, { refetch }] = createResource(inspectStorage);
  const [workerState, setWorkerState] = createSignal('');
  let registration: ServiceWorkerRegistration | undefined;
  let worker: ServiceWorker | null = null;
  let disposed = false;
  const refresh = () => {
    setWorkerState(registration?.waiting ? 'ready' : registration?.installing ? 'installing' : '');
    refetch();
  };
  const workerChanged = () => {
    if (worker?.state === 'redundant' && !registration?.waiting) setWorkerState('failed');
    else refresh();
  };
  const watchWorker = () => {
    worker?.removeEventListener('statechange', workerChanged);
    worker = registration?.installing ?? null;
    worker?.addEventListener('statechange', workerChanged);
    refresh();
  };
  onMount(async () => {
    try {
      const found = await navigator.serviceWorker?.getRegistration();
      if (disposed) return;
      registration = found;
      registration?.addEventListener('updatefound', watchWorker);
      watchWorker();
    } catch {
      setWorkerState('unavailable');
    }
  });
  onCleanup(() => {
    disposed = true;
    registration?.removeEventListener('updatefound', watchWorker);
    worker?.removeEventListener('statechange', workerChanged);
  });
  const updateLine = (waiting: boolean, installing: boolean) => {
    if (workerState() === 'failed') return 'No se pudo preparar la actualización. Vuelve a intentarlo con conexión.';
    if (workerState() === 'ready' || waiting) return 'Hay una versión nueva lista. Se usará al volver a abrir la app.';
    if (workerState() === 'installing' || installing) return 'Descargando una versión nueva…';
    return '';
  };
  return (
    <section class="sheet mt-5 p-4">
      <h2 class="font-display text-lg font-semibold">Sin conexión</h2>
      <p class="mt-1 text-sm text-ink-soft">{contentVersionLabel()}. Las correcciones de palabras, caracteres y temas llegan con cada versión de la app.</p>
      <Show when={downloadState().state === 'downloading'}><p role="status" class="mt-2 text-sm">Descargando archivos {downloadState().total ? `${downloadState().done} de ${downloadState().total}` : 'de las listas'}…</p></Show>
      <Show when={downloadState().state === 'ready'}><p role="status" class="mt-2 text-sm">Las listas seleccionadas están preparadas sin conexión.</p></Show>
      <Show when={downloadState().state === 'error'}>
        <p role="alert" class="mt-2 text-sm text-seal">No se pudieron guardar todos los archivos. Algunas funciones necesitan conexión.</p>
        <button type="button" class="btn-quiet mt-2 h-11 px-4 text-sm" onClick={() => void saveStudyMedia()}>Reintentar descarga</button>
      </Show>
      <Show when={!status.loading} fallback={<p class="mt-1 text-sm text-ink-soft">Comprobando…</p>}>
        <Show when={status()} fallback={<p class="mt-1 text-sm text-ink-soft">Este navegador no deja ver qué hay guardado.</p>}>
          {(data) => <>
            <p class="mt-1 text-sm text-ink-soft">
              Funciona sin internet con lo que ya está guardado
              <Show when={data().usage !== undefined}> ({((data().usage ?? 0) / 1024 / 1024).toFixed(0)} MB)</Show>.
            </p>
            <ul class="mt-3 flex flex-wrap gap-2">
              <For each={data().groups.filter((group) => group.paths.length > 0)}>{(group) => (
                <li class="rounded-full border border-line px-3 py-1 text-xs font-medium text-ink-soft">{group.label}</li>
              )}</For>
            </ul>
            <Show when={updateLine(!!data().waiting, !!data().installing)}>
              {(line) => <p role="status" class="mt-3 text-sm text-ink">{line()}</p>}
            </Show>
          </>}
        </Show>
      </Show>
    </section>
  );
}
