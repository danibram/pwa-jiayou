import { Component, createSignal, For, Show } from 'solid-js';
import Icon from '../components/Icon';
import TopBar from '../components/TopBar';
import { BUNDLED_LEVEL, catalogLevel } from '../data/catalog';
import { DEFAULT_LIST, listLabel, type ListId } from '../data/lists';
import { studyList, studyLists } from '../stores/studyLists';
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
  const on = (id: ListId) => chosen().includes(id);
  /** "HSK 1", "HSK 1 y 2" or "3 listas", so the button says what it starts. */
  const startLabel = () => (chosen().length <= 2 ? listLabel(chosen()) : `${chosen().length} listas`);

  const toggle = (id: ListId) => {
    const current = chosen();
    setChosen(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const save = () => {
    if (chosen().length === 0) return;
    void applyListChoice(chosen()).catch(() => {});
    props.onDone();
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
          Marca uno o varios. Puedes empezar enseguida. Los trazos y audios se descargan en segundo plano para usarlos sin conexión. Puedes cambiarlo en Opciones.
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
      <button type="button" class="btn-ink mt-3 h-14 w-full shrink-0 text-base" disabled={chosen().length === 0} onClick={save}>
        Empezar con {startLabel()}
      </button>
    </div>
  );
};

export default Listas;
