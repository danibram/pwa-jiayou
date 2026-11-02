import { Component, Show } from 'solid-js';
import Drawer from './Drawer';

interface SessionLeaveSheetProps {
  open: boolean;
  /** Defaults to the shared "¿Sales de la sesión?". */
  title?: string;
  /** Also called after a drag down, a tap outside or Escape, once the drawer has slid away. */
  onStay: () => void;
  onPause: () => void;
  onDiscard: () => void;
  /** Answers given before the session was paused. Descartar undoes those as well. */
  answeredBeforePause?: number;
}

/** Asked only when the session holds answers or was resumed. An untouched session just closes. */
const SessionLeaveSheet: Component<SessionLeaveSheetProps> = (props) => {
  let dismiss = () => props.onStay();
  return (
    <Show when={props.open}>
      <Drawer
        aria-labelledby="leave-title"
        class="border-x-0 px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
        dismissRef={(fn) => (dismiss = fn)}
        onClose={() => props.onStay()}
      >
        <p id="leave-title" class="mt-3 text-center font-display text-xl font-semibold text-ink">
          {props.title ?? '¿Sales de la sesión?'}
        </p>
        <p class="mt-1 text-center text-sm text-ink-soft">
          Si pausas, sigues luego donde lo dejaste.{' '}
          {(props.answeredBeforePause ?? 0) > 0
            ? `Si descartas, se borra toda la sesión, también ${props.answeredBeforePause === 1 ? 'la respuesta' : `las ${props.answeredBeforePause} respuestas`} de antes de la pausa.`
            : 'Si descartas, se borran las respuestas de esta sesión.'}
        </p>
        <button type="button" class="btn-ink mt-4 h-14 w-full text-[0.9375rem]" onClick={() => dismiss()}>
          Seguir
        </button>
        <button type="button" class="mt-1 h-11 w-full text-sm text-ink-soft" onClick={() => props.onPause()}>
          Pausar y salir
        </button>
        <button type="button" class="h-11 w-full text-sm text-ink-soft" onClick={() => props.onDiscard()}>
          Descartar y salir
        </button>
      </Drawer>
    </Show>
  );
};

export default SessionLeaveSheet;
