import { createResource, createSignal, For, onCleanup, onMount, Show } from 'solid-js';

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
  return (
    <section class="sheet mt-5 p-4">
      <h2 class="font-display text-lg font-semibold">En este dispositivo</h2>
      <p class="mt-1 text-sm text-ink-soft">Recursos guardados por esta app para usarlos sin conexión.</p>
      <Show when={!status.loading} fallback={<p class="mt-3 text-sm text-ink-soft">Consultando almacenamiento…</p>}>
        <Show when={status()} fallback={<p class="mt-3 text-sm text-ink-soft">El navegador no permite consultar el almacenamiento.</p>}>
          {(data) => <>
            <ul class="mt-3 divide-y divide-line/70">
              <For each={data().groups}>{(group) => <li>
                <details class="py-2 text-sm">
                  <summary class="cursor-pointer font-medium">{group.label} · {group.paths.length} archivos</summary>
                  <ul class="mt-2 max-h-40 overflow-y-auto break-all text-xs text-ink-soft"><For each={group.paths}>{(path) => <li class="py-0.5">{decodeURI(path)}</li>}</For></ul>
                </details>
              </li>}</For>
            </ul>
            <Show when={data().usage !== undefined}><p class="mt-2 text-sm text-ink-soft">Espacio estimado del sitio: {((data().usage ?? 0) / 1024 / 1024).toFixed(1)} MB</p></Show>
            <p role="status" class="mt-2 text-sm text-ink-soft">{workerState() === 'failed' ? 'No se pudo preparar la actualización. Vuelve a intentarlo con conexión.' : workerState() === 'unavailable' ? 'No se puede consultar el estado de actualización.' : workerState() === 'ready' || data().waiting ? 'Hay una actualización lista.' : workerState() === 'installing' || data().installing ? 'Se está descargando y preparando una actualización.' : 'No hay ninguna actualización pendiente en este momento.'}</p>
            <p class="mt-2 text-xs text-ink-soft">El navegador puede borrar estos datos. El espacio es una estimación del sitio completo.</p>
          </>}
        </Show>
      </Show>
      <button type="button" class="btn-quiet mt-3 h-11 px-4 text-sm" onClick={() => refetch()}>Volver a consultar</button>
    </section>
  );
}
