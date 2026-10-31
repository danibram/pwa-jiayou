import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import { registerSW } from 'virtual:pwa-register';

export default function UpdateNotice() {
  const [ready, setReady] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const [dismissed, setDismissed] = createSignal(false);
  let registration: ServiceWorkerRegistration | undefined;

  const update = registerSW({
    onNeedRefresh() { setDismissed(false); setReady(true); },
    onRegisteredSW(_url, value) { registration = value; },
  });

  const check = () => {
    if (document.visibilityState === 'visible') registration?.update().catch(() => {});
  };
  let timer: ReturnType<typeof setInterval> | undefined;
  onMount(() => {
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', check);
    timer = setInterval(check, 60 * 60 * 1000);
  });
  onCleanup(() => {
    document.removeEventListener('visibilitychange', check);
    window.removeEventListener('online', check);
    clearInterval(timer);
  });

  return (<>
    <Show when={ready() && !dismissed()}>
      <aside role="status" class="sheet fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md flex-wrap items-center gap-3 p-4 text-ink">
        <div class="min-w-0 flex-1 basis-48">
          <p class="font-semibold">Hay una nueva versión</p>
          <p class="mt-1 text-sm text-ink-soft">La app se reiniciará. Termina tu sesión antes de actualizar.</p>
          <Show when={failed()}><p class="mt-1 text-sm text-seal">No se pudo actualizar. Inténtalo de nuevo.</p></Show>
        </div>
        <button type="button" class="btn-ink h-11 px-4 text-sm" onClick={() => update(true).catch(() => setFailed(true))}>
          Actualizar
        </button>
        <button type="button" class="h-11 px-2 text-sm text-ink-soft" onClick={() => setDismissed(true)}>
          Más tarde
        </button>
      </aside>
    </Show>
    <Show when={ready() && dismissed()}>
      <button type="button" class="btn-quiet fixed bottom-4 right-4 z-50 h-11 px-4 text-sm" onClick={() => setDismissed(false)}>
        Actualización disponible
      </button>
    </Show>
  </>);
}
