import { Component, For, Show, createSignal } from 'solid-js';
import SegmentedPicker from '../../SegmentedPicker';
import { learningSettings as defaultStore, type LearningSettingsStore, type StudySettings as StudySettingsValue } from '../../../persistence/learningSettings';

interface Setting {
  field: keyof StudySettingsValue;
  title: string;
  /** One line on what the number limits. */
  help: string;
  presets: number[];
  /** A field another one caps, so presets above the cap are hidden. */
  cap?: (settings: StudySettingsValue) => number;
}

const SETTINGS: Setting[] = [
  {
    field: 'newPerDay',
    title: 'Palabras nuevas al día',
    help: 'Tope de palabras que ves por primera vez cada día, contando todos los modos.',
    presets: [10, 20, 30, 40],
  },
  {
    field: 'todayNewPerDay',
    title: 'Nuevas en Hoy',
    help: 'La parte de ese tope que usa Hoy. El resto queda para Más palabras y Temas.',
    presets: [5, 10, 15, 20],
    cap: (settings) => settings.newPerDay,
  },
  {
    field: 'newPerSession',
    title: 'Nuevas por sesión',
    help: 'Palabras nuevas que entran en una sesión. Cada una ocupa dos tarjetas, la lección y una práctica.',
    presets: [5, 10, 15],
  },
  {
    field: 'workLimit',
    title: 'Tarjetas por sesión',
    help: 'Tamaño de la sesión. Los repasos pendientes entran primero y lo que no cabe espera a la siguiente.',
    presets: [20, 30, 45, 60],
  },
  {
    field: 'practiceLimit',
    title: 'Práctica por sesión',
    help: 'Tarjetas de práctica en Flojos, Repasar todo y Temas. La práctica no cambia cuándo vuelve cada palabra.',
    presets: [10, 20, 30],
    cap: (settings) => settings.workLimit,
  },
];

/** Presets under the cap, plus the stored value when it is not one of them. */
const optionsFor = (setting: Setting, settings: StudySettingsValue) => {
  const cap = setting.cap?.(settings) ?? Infinity;
  const values = new Set(setting.presets.filter((value) => value <= cap));
  values.add(settings[setting.field]);
  return [...values].sort((a, b) => a - b).map((value) => ({ value: String(value), label: String(value) }));
};

interface StudySettingsProps {
  /** Defaults to the app's stored settings. */
  store?: LearningSettingsStore;
  /** Wipes the learning log and its caches. Without it, or outside development, the reset is hidden. */
  onReset?: () => void | Promise<void>;
  /** Shows development tools. Defaults to the Vite dev flag. */
  dev?: boolean;
}

/** Study budgets for Opciones, in the same sheet style. */
const StudySettings: Component<StudySettingsProps> = (props) => {
  const store = () => props.store ?? defaultStore;
  const [saveFailed, setSaveFailed] = createSignal(false);
  const [confirmReset, setConfirmReset] = createSignal(false);
  const [resetting, setResetting] = createSignal(false);
  const [resetMessage, setResetMessage] = createSignal('');
  const showReset = () => (props.dev ?? import.meta.env.DEV) && !!props.onReset;

  const change = (field: keyof StudySettingsValue, value: string) => {
    setSaveFailed(!store().update({ [field]: Number(value) }));
  };

  const reset = async () => {
    if (!props.onReset || resetting()) return;
    setResetting(true);
    try {
      await props.onReset();
      setResetMessage('Progreso de aprendizaje reiniciado.');
      setConfirmReset(false);
    } catch {
      setResetMessage('No se pudo reiniciar. El progreso sigue como estaba.');
    } finally {
      setResetting(false);
    }
  };

  return (
    <section class="sheet mt-5 p-4">
      <h2 class="font-display text-lg font-semibold">Estudio</h2>
      <p class="mt-1 text-sm leading-relaxed text-ink-soft">Cuánto trabajo trae cada día y cada sesión. Los cambios se aplican a la próxima sesión.</p>
      <For each={SETTINGS}>
        {(setting) => (
          <div class="mt-4">
            <h3 class="text-sm font-semibold text-ink">{setting.title}</h3>
            <p class="mt-0.5 text-sm leading-snug text-ink-soft">{setting.help}</p>
            <SegmentedPicker
              class="mt-2"
              label={setting.title}
              options={optionsFor(setting, store().settings())}
              value={String(store().settings()[setting.field])}
              onChange={(value) => change(setting.field, value)}
            />
          </div>
        )}
      </For>
      <Show when={saveFailed()}>
        <p role="status" class="mt-3 text-sm">No se pudo guardar en este dispositivo. El cambio vale hasta que cierres la app.</p>
      </Show>

      <Show when={showReset()}>
        <div class="mt-5 border-t border-line pt-4">
          <h3 class="text-sm font-semibold text-ink">Desarrollo</h3>
          <p class="mt-0.5 text-sm leading-snug text-ink-soft">Borra todas las respuestas del nuevo sistema de aprendizaje en este dispositivo.</p>
          <Show
            when={confirmReset()}
            fallback={
              <button type="button" class="btn-quiet mt-2 h-11 px-4 text-sm" onClick={() => { setResetMessage(''); setConfirmReset(true); }}>
                Reiniciar progreso de aprendizaje
              </button>
            }
          >
            <p class="mt-2 text-sm text-ink-soft">No se puede deshacer. Exporta una copia antes si quieres conservarlo.</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <button type="button" class="btn-ink h-11 px-4 text-sm" disabled={resetting()} onClick={() => void reset()}>Sí, reiniciar</button>
              <button type="button" class="btn-quiet h-11 px-4 text-sm" onClick={() => setConfirmReset(false)}>Cancelar</button>
            </div>
          </Show>
          <Show when={resetMessage()}><p role="status" class="mt-3 text-sm">{resetMessage()}</p></Show>
        </div>
      </Show>
    </section>
  );
};

export default StudySettings;
