import { Component, createSignal, Show } from 'solid-js';
import { CANVAS_MAX } from './layout';
import Icon from '../../Icon';
import StrokeCanvas, { type StrokeCanvasApi } from '../../StrokeCanvas';

interface WatchStrokesProps {
  char: string;
  /** First sight of a character: the animation runs slower. */
  slow?: boolean;
}

/**
 * The stroke order of one character: an animation that plays when the strokes load and on a tap,
 * and a step-by-step view with the direction of each stroke. Watching records nothing by itself.
 */
const WatchStrokes: Component<WatchStrokesProps> = (props) => {
  const [count, setCount] = createSignal(0);
  const [step, setStep] = createSignal<number | null>(null);
  let canvas: StrokeCanvasApi | undefined;

  const play = () => {
    setStep(null);
    canvas?.play();
  };

  const stepBy = (delta: number) => {
    const n = count();
    if (n === 0) return;
    const s = step();
    if (delta < 0) setStep(s === null || s === 0 ? null : s - 1);
    else setStep(s === null ? 0 : Math.min(n - 1, s + 1));
  };

  const line = () => {
    const s = step();
    if (s !== null) return `Trazo ${s + 1} de ${count()}`;
    return count() > 0 ? `${count()} ${count() === 1 ? 'trazo' : 'trazos'}` : '';
  };

  return (
    <div class="flex flex-col">
      <p class="mb-2 h-5 text-center text-sm tabular-nums text-ink-soft" aria-live="polite">{line()}</p>
      <div class="mx-auto w-full" style={{ 'max-width': CANVAS_MAX }} onClick={() => step() === null && play()}>
        <StrokeCanvas
          char={props.char}
          mode="watch"
          step={step()}
          showOutline
          slow={props.slow}
          onReady={(n) => {
            setCount(n);
            play();
          }}
          api={(api) => (canvas = api)}
        />
      </div>
      <div class="mt-3 flex h-11 items-center justify-center gap-2">
        <Show
          when={step() !== null}
          fallback={
            <>
              <button type="button" class="btn-quiet h-11 px-4 text-sm shadow-none" onClick={play}>
                <Icon name="replay" size={16} />
                Repetir
              </button>
              <Show when={count() > 1}>
                <button type="button" class="btn-quiet h-11 px-4 text-sm shadow-none" onClick={() => stepBy(1)}>
                  <Icon name="play" size={16} />
                  Paso a paso
                </button>
              </Show>
            </>
          }
        >
          <button type="button" class="btn-quiet h-11 flex-1 text-sm shadow-none" disabled={step() === 0} onClick={() => stepBy(-1)}>
            Anterior
          </button>
          <Show
            when={(step() ?? 0) < count() - 1}
            fallback={
              <button type="button" class="btn-quiet h-11 flex-1 text-sm shadow-none" onClick={() => setStep(null)}>
                Cerrar
              </button>
            }
          >
            <button type="button" class="btn-quiet h-11 flex-1 text-sm shadow-none" onClick={() => stepBy(1)}>
              Siguiente
            </button>
          </Show>
        </Show>
      </div>
    </div>
  );
};

export default WatchStrokes;
