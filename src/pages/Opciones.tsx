import { Component, createSignal } from 'solid-js';
import TopBar from '../components/TopBar';
import VoicePicker from '../components/VoicePicker';
import OfflineStatus from '../components/OfflineStatus';
import ProgressBackup from '../components/ProgressBackup';

interface OpcionesProps {
  onBack: () => void;
  onManageLists: () => void;
}

/** Settings: levels, voice, offline use and the progress backup. Credits live in Acerca de. */
const Opciones: Component<OpcionesProps> = (props) => {
  const [scrolled, setScrolled] = createSignal(false);
  return (
    <div class="screen">
      <div class="animate-rise -mx-4 px-4" classList={{ 'border-b border-line': scrolled() }}>
        <TopBar title="Opciones" onBack={props.onBack} backLabel="Volver" />
      </div>
      <div
        class="-mx-4 -mb-[max(env(safe-area-inset-bottom),1rem)] min-h-0 flex-1 overflow-y-auto no-scrollbar px-4 pt-4 pb-8"
        onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 4)}
      >
        <section class="sheet p-4 animate-rise [animation-delay:60ms]">
          <h2 class="font-display text-lg font-semibold">Niveles</h2>
          <p class="mt-1 text-sm leading-relaxed text-ink-soft">
            Elige qué niveles HSK estudiar. HSK 1 viene incluido; los demás se descargan a este dispositivo.
          </p>
          <button type="button" class="btn-quiet mt-3 h-11 px-4 text-sm" onClick={props.onManageLists}>
            Elegir niveles
          </button>
        </section>

        <section class="sheet mt-5 p-4 animate-rise [animation-delay:120ms]">
          <h2 class="font-display text-lg font-semibold">Voz</h2>
          <p class="mt-1 text-sm leading-relaxed text-ink-soft">Fuente del botón de escuchar en palabras y caracteres. Entre paréntesis, lo que hace cada toque.</p>
          <div class="mt-3">
            <VoicePicker />
          </div>
        </section>

        <div class="animate-rise [animation-delay:180ms]">
          <OfflineStatus />
        </div>
        <div class="animate-rise [animation-delay:240ms]">
          <ProgressBackup />
        </div>
      </div>
    </div>
  );
};

export default Opciones;
