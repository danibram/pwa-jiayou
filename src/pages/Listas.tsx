import { Component, createSignal, For, Show } from 'solid-js';
import Icon from '../components/Icon';
import TopBar from '../components/TopBar';
import { BUNDLED_LEVEL, catalogLevel } from '../data/catalog';
import { DEFAULT_LIST, hskLevelsOf, listLabel, studyList, studyLists, type ListId } from '../data/lists';
import { vocabularyStore } from '../stores/vocabularyStore';
import { applyListChoice, hasUsedApp, readInstalledLevels } from '../utils/levelPacks';

interface ListasProps {
  onDone: () => void;
  onCancel?: () => void;
}

/** The lists being studied now. A first visit starts at HSK 1. */
const startingChoice = (): ListId[] => {
  // Only lists that show a row, so an emptied "Mis palabras" can't stay ticked out of sight.
  if (readInstalledLevels() || hasUsedApp()) return vocabularyStore.state.selectedLists.filter((id) => (studyList(id)?.words.length ?? 0) > 0);
  return [DEFAULT_LIST];
};

const Listas: Component<ListasProps> = (props) => {
  const [chosen, setChosen] = createSignal<ListId[]>(startingChoice());
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal('');
  const [progress, setProgress] = createSignal<{ done: number; total: number }>();
  const installed = readInstalledLevels() ?? [BUNDLED_LEVEL];
  /** Ticked levels not on the device yet. Packs only borrowed from (HSK 2 for HSK 1 words) come along without a mention. */
  const newLevels = () => hskLevelsOf(chosen()).filter((level) => level !== BUNDLED_LEVEL && !installed.includes(level));
  const percent = () => {
    const p = progress();
    return p && p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
  };
  const on = (id: ListId) => chosen().includes(id);
  /** "HSK 1", "HSK 1 y 2" or "3 listas", so the button says what it starts. */
  const startLabel = () => (chosen().length <= 2 ? listLabel(chosen()) : `${chosen().length} listas`);

  const toggle = (id: ListId) => {
    if (saving()) return;
    const current = chosen();
    setChosen(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setError('');
  };

  const save = async () => {
    if (chosen().length === 0) return;
    setSaving(true);
    setError('');
    try {
      await applyListChoice(chosen(), (done, total) => setProgress({ done, total }));
      props.onDone();
    } catch {
      setError('No se pudieron guardar las listas. Comprueba la conexión y vuelve a intentarlo.');
      setSaving(false);
      setProgress(undefined);
    }
  };

  return (
    <div class="screen">
      <Show when={props.onCancel}>
        <div class="animate-rise">
          <TopBar title="Listas" onBack={() => props.onCancel?.()} backLabel="Volver" />
        </div>
      </Show>
      <div class="min-h-0 flex-1 overflow-y-auto no-scrollbar pt-4">
        <h1 class="font-display text-[1.75rem] font-semibold leading-tight animate-rise [animation-delay:60ms]">¿Qué niveles quieres estudiar?</h1>
        <p class="mt-2 text-sm leading-relaxed text-ink-soft animate-rise [animation-delay:90ms]">
          Marca uno o varios. Las palabras vienen con la app; sus trazos y audios se descargan una vez y luego funcionan sin conexión. Puedes cambiarlo en Opciones.
        </p>
        <ul class="sheet mt-5 overflow-hidden px-4 animate-rise [animation-delay:140ms]" aria-label="Listas">
          {/* An empty own list has nothing to study yet; it is filled from Mis palabras. */}
          <For each={studyLists().filter((list) => list.words.length > 0)}>
            {(list) => {
              const pack = list.hskLevel ? catalogLevel(list.hskLevel) : undefined;
              const counts = `${list.words.length} palabras${pack ? ` · ${pack.count} caracteres` : ''}`;
              return (
              <li class="border-t border-line first:border-t-0">
                <Show
                  when={!pack || pack.available || pack.level === BUNDLED_LEVEL}
                  fallback={
                    <div class="flex min-h-11 items-center gap-3 py-3">
                      <div class="min-w-0 flex-1">
                        <div class="font-medium">{list.title}</div>
                        <div class="text-sm text-ink-soft tabular-nums">{counts}</div>
                      </div>
                      <span class="text-sm text-ink-faint">Sin paquete</span>
                    </div>
                  }
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on(list.id)}
                    disabled={saving()}
                    onClick={() => toggle(list.id)}
                    class="flex min-h-11 w-full items-center gap-3 py-3 text-left"
                  >
                    <span
                      class="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2"
                      classList={{
                        'border-ink bg-ink text-paper': on(list.id),
                        'border-line bg-surface': !on(list.id),
                      }}
                      aria-hidden="true"
                    >
                      <Show when={on(list.id)}>
                        <Icon name="check" size={12} />
                      </Show>
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block font-medium">
                        {list.title}
                        <Show when={pack?.level === BUNDLED_LEVEL}>
                          <span class="ml-2 text-xs font-normal text-ink-faint">Incluido</span>
                        </Show>
                      </span>
                      <span class="block text-sm text-ink-soft tabular-nums">{counts}</span>
                    </span>
                  </button>
                </Show>
              </li>
              );
            }}
          </For>
        </ul>
      </div>
      <Show when={chosen().length === 0}>
        <p class="mt-3 text-sm text-ink-soft">Marca al menos una lista para empezar.</p>
      </Show>
      <Show when={error()}>
        <p role="alert" class="mt-3 text-sm text-seal">{error()}</p>
      </Show>
      <Show when={saving()}>
        <div class="mt-3 h-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Descargando trazos y audios" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent()}>
          <div class="h-full rounded-full bg-ink/60 transition-[width] duration-200" style={{ width: `${Math.max(4, percent())}%` }} />
        </div>
      </Show>
      <button type="button" class="btn-ink mt-3 h-14 w-full shrink-0 text-base" disabled={saving() || chosen().length === 0} aria-busy={saving()} onClick={() => void save()}>
        {saving() ? (progress()?.total ? `Descargando… ${percent()} %` : 'Guardando…') : `${newLevels().length > 0 ? 'Descargar y empezar' : 'Empezar'} con ${startLabel()}`}
      </button>
    </div>
  );
};

export default Listas;
