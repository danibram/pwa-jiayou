import { Component, createSignal, For, Show } from 'solid-js';
import Icon from '../components/Icon';
import TopBar from '../components/TopBar';
import { BUNDLED_LEVEL, catalogLevels } from '../data/catalog';
import type { HskLevel } from '../types';
import { applyLevelChoice, hasUsedApp, readInstalledLevels } from '../utils/levelPacks';

interface ListasProps {
  onDone: () => void;
  onCancel?: () => void;
}

const startingChoice = (): HskLevel[] => {
  const saved = readInstalledLevels();
  if (saved) return saved;
  if (hasUsedApp()) return catalogLevels.filter((row) => row.available).map((row) => row.level);
  return [BUNDLED_LEVEL];
};

const Listas: Component<ListasProps> = (props) => {
  const [chosen, setChosen] = createSignal<HskLevel[]>(startingChoice());
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal('');
  const on = (level: HskLevel) => level === BUNDLED_LEVEL || chosen().includes(level);

  const toggle = (level: HskLevel) => {
    if (saving()) return;
    const current = chosen();
    setChosen(current.includes(level) ? current.filter((item) => item !== level) : [...current, level]);
    setError('');
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await applyLevelChoice(chosen());
      props.onDone();
    } catch {
      setError('No se pudieron guardar las listas. Comprueba la conexión y vuelve a intentarlo.');
      setSaving(false);
    }
  };

  return (
    <div class="screen">
      <Show when={props.onCancel}>
        <TopBar title="Listas" onBack={() => props.onCancel?.()} backLabel="Volver" />
      </Show>
      <div class="min-h-0 flex-1 overflow-y-auto no-scrollbar pt-4">
        <h1 class="font-display text-[1.75rem] font-semibold leading-tight">Qué listas quieres guardar</h1>
        <p class="mt-2 text-sm leading-relaxed text-ink-soft">
          HSK 1 viene con la app. Las demás se bajan a este dispositivo. Un tema solo practica los caracteres que tienes, y te dice si la lista sigue.
        </p>
        <ul class="sheet mt-5 overflow-hidden px-4" aria-label="Niveles HSK">
          <For each={catalogLevels}>
            {(row) => (
              <li class="border-t border-line first:border-t-0">
                <Show
                  when={row.available && row.level !== BUNDLED_LEVEL}
                  fallback={
                    <div class="flex min-h-11 items-center gap-3 py-3">
                      <div class="min-w-0 flex-1">
                        <div class="font-medium">HSK {row.level}</div>
                        <div class="text-sm text-ink-soft tabular-nums">{row.count} caracteres</div>
                      </div>
                      <span class="text-sm text-ink-faint">{row.level === BUNDLED_LEVEL ? 'Con la app' : 'Sin paquete'}</span>
                    </div>
                  }
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on(row.level)}
                    disabled={saving()}
                    onClick={() => toggle(row.level)}
                    class="flex min-h-11 w-full items-center gap-3 py-3 text-left"
                  >
                    <span
                      class="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2"
                      classList={{
                        'border-ink bg-ink text-paper': on(row.level),
                        'border-line bg-surface': !on(row.level),
                      }}
                      aria-hidden="true"
                    >
                      <Show when={on(row.level)}>
                        <Icon name="check" size={12} />
                      </Show>
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block font-medium">HSK {row.level}</span>
                      <span class="block text-sm text-ink-soft tabular-nums">{row.count} caracteres</span>
                    </span>
                  </button>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </div>
      <Show when={error()}>
        <p role="alert" class="mt-3 text-sm text-seal">{error()}</p>
      </Show>
      <button type="button" class="btn-ink mt-3 h-11 w-full shrink-0" disabled={saving()} onClick={() => void save()}>
        {saving() ? 'Guardando…' : 'Guardar en este dispositivo'}
      </button>
    </div>
  );
};

export default Listas;
