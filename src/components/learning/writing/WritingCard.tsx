import { Component, createEffect, createMemo, createSignal, Match, on, onCleanup, Show, Switch } from 'solid-js';
import { CANVAS_MAX } from './layout';
import type { ExerciseSelection } from '../../../domain/learning/exercises';
import type { Exercise, ExposureCard, RevealedAnswer, SpeechAudio } from '../../../domain/learning/types';
import Icon from '../../Icon';
import Pinyin from '../../Pinyin';
import SpeakButton from '../../SpeakButton';
import StrokeCanvas, { type StrokeCanvasApi } from '../../StrokeCanvas';
import { RATING_LABEL, scheduleNote } from '../present';
import type { LearningSessionActions, LearningSessionView } from '../types';
import { autoStrokeHint, drawnMistakes, hintsIn, OUTLINE_HINT, outlineTaken, STROKE_HINT } from './hints';
import WatchStrokes from './WatchStrokes';

interface WritingCardProps {
  view: LearningSessionView;
  actions: LearningSessionActions;
}

const mistakesText = (n: number) => (n === 0 ? 'Sin errores' : `${n} ${n === 1 ? 'error' : 'errores'}`);

/** The meaning, the reading and its sound, over every writing card. */
const Prompt: Component<{ eyebrow: string; answer: RevealedAnswer; pinyin: string | null; audio: SpeechAudio | null; speech: boolean }> = (props) => (
  <div class="px-2 pb-3 text-center">
    <p class="eyebrow">{props.eyebrow}</p>
    <p class="mt-1 font-sans text-2xl font-semibold leading-tight text-balance">{props.answer.meaning}</p>
    <Show when={props.pinyin}>
      {(pinyin) => (
        <div class="mt-1 flex items-center justify-center gap-1">
          <Pinyin text={pinyin()} class="text-xl font-medium" />
          <Show when={props.speech && props.audio}>
            {(audio) => <SpeakButton pinyin={audio().pinyin} hanzi={audio().hanzi} label={`Escuchar ${audio().hanzi}`} />}
          </Show>
        </div>
      )}
    </Show>
  </div>
);

/** Watching the strokes is the teaching exposure: nothing to answer, Continuar records it. */
const WatchCard: Component<{ card: ExposureCard; view: WritingCardProps['view']; actions: WritingCardProps['actions'] }> = (props) => (
  <>
    <div class="flex min-h-0 flex-1 flex-col overflow-y-auto py-2 [justify-content:safe_center]">
      <Prompt eyebrow="Carácter nuevo · mira el orden" answer={props.card.answer} pinyin={props.card.answer.pinyin} audio={props.card.audio} speech={props.view.speechAvailable} />
      <WatchStrokes char={props.card.answer.characters} slow />
    </div>
    <button type="button" class="btn-ink mt-3 h-14 w-full" disabled={props.view.state !== 'presenting'} onClick={() => props.actions.continue()}>
      Continuar
    </button>
  </>
);

/**
 * Tracing (`stage: 'trace'`) and writing from memory (`stage: 'memory'`). The stroke checker counts
 * mistakes and the drawing goes to the controller, which evaluates and rates; tracing never rates.
 * Every hint is recorded before the drawing: "Pista" and "Contorno" on request, and the stroke the
 * canvas shows by itself after repeated misses.
 */
const DrawCard: Component<{ exercise: Exercise; view: WritingCardProps['view']; actions: WritingCardProps['actions'] }> = (props) => {
  const memory = props.exercise.stage === 'memory';
  const answer = props.exercise.answer!;
  const [guide, setGuide] = createSignal(true);
  const [done, setDone] = createSignal(0);
  const [count, setCount] = createSignal(0);
  const [mistakes, setMistakes] = createSignal(0);
  const [missed, setMissed] = createSignal<number[]>([]);
  const [shake, setShake] = createSignal(false);
  let canvas: StrokeCanvasApi | undefined;
  let shakeTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(shakeTimer));

  const open = () => props.view.state === 'presenting';
  // Undo voids the drawing and shows the same card again, through saving: the finished quiz starts over.
  let answered = false;
  createEffect(on(() => props.view.state, (state) => {
    if (state === 'feedback') answered = true;
    if (state !== 'presenting' || !answered) return;
    answered = false;
    setDone(0);
    setMistakes(0);
    setMissed([]);
    canvas?.restartQuiz();
  }));
  const outline = () => outlineTaken(props.view.actions);
  const hinted = () => hintsIn(props.view.actions).length > 0;
  const feedback = () => (props.view.state === 'feedback' ? props.view.feedback : null);
  const skipped = () => props.view.actions.some((action) => action.type === 'drawing' && action.evaluation.outcome === 'unanswered');

  const askStroke = () => {
    if (!open()) return;
    props.actions.hint(STROKE_HINT);
    canvas?.hint();
  };
  const askOutline = () => {
    if (!open() || outline()) return;
    props.actions.hint(OUTLINE_HINT);
  };

  const line = () => {
    const n = count();
    if (n === 0) return '';
    return done() > 0 && done() < n ? `Trazo ${done() + 1} de ${n}` : `${n} ${n === 1 ? 'trazo' : 'trazos'}`;
  };

  const resultTitle = () => {
    const shown = feedback();
    if (!shown) return '';
    if (shown.recorded === 'scheduled-review' && shown.rating) return RATING_LABEL[shown.rating];
    if (skipped()) return 'Saltado';
    return shown.outcome === 'correct' ? (memory ? 'De memoria' : 'Calcado') : 'Con errores';
  };

  const resultDetail = () => {
    if (skipped()) return 'Sin dibujar';
    const n = drawnMistakes(props.view.actions) ?? mistakes();
    const strokes = [...missed()].sort((a, b) => a - b).map((stroke) => stroke + 1);
    const review = strokes.length > 0 ? ` · revisa ${strokes.length === 1 ? 'el trazo' : 'los trazos'} ${strokes.join(', ')}` : '';
    return `${mistakesText(n)}${hinted() ? ' · con pista' : ''}${review}`;
  };

  return (
    <>
      <div class="flex min-h-0 flex-1 flex-col overflow-y-auto py-2 [justify-content:safe_center]">
        <Prompt
          eyebrow={memory ? 'De memoria' : 'Calca el carácter'}
          answer={answer}
          pinyin={props.exercise.context}
          audio={props.exercise.audio}
          speech={props.view.speechAvailable}
        />
        <div class="mb-2 flex h-5 items-center justify-center gap-2 text-sm tabular-nums">
          <span class="text-ink-soft">{line()}</span>
          <Show when={mistakes() > 0}>
            <span class="rounded-full bg-seal-soft px-2 py-0.5 text-xs font-semibold text-seal">{mistakesText(mistakes())}</span>
          </Show>
        </div>
        <div class="relative mx-auto w-full" style={{ 'max-width': CANVAS_MAX }} classList={{ 'animate-shake': shake() }}>
          <StrokeCanvas
            char={answer.characters}
            mode="write"
            step={null}
            showOutline={memory ? outline() : guide()}
            ghost={!memory && !guide()}
            startHint={!memory && guide() ? 'always' : 'never'}
            hintAfterMisses={memory ? 3 : 2}
            echoInk={memory}
            onReady={setCount}
            onStroke={(n, m) => {
              setDone(n);
              setMistakes(m);
            }}
            onMistake={(stroke, total) => {
              setMistakes(total);
              setMissed((list) => (list.includes(stroke) ? list : [...list, stroke]));
              setShake(true);
              clearTimeout(shakeTimer);
              shakeTimer = setTimeout(() => setShake(false), 400);
            }}
            onAutoHint={(stroke) => {
              if (open()) props.actions.hint(autoStrokeHint(stroke));
            }}
            onComplete={(total) => {
              setDone(count());
              if (open()) props.actions.drawing({ mistakes: total });
            }}
            api={(api) => (canvas = api)}
          />
        </div>
      </div>

      <Show
        when={feedback()}
        fallback={
          <div class="mt-3 flex min-h-[3.5rem] flex-col justify-end gap-1">
            <Show
              when={memory}
              fallback={
                <div class="flex h-11 items-center justify-center gap-2">
                  <button
                    type="button"
                    class="btn-quiet h-11 w-40 text-sm shadow-none"
                    classList={{ 'border-ink bg-ink font-semibold text-paper': guide() }}
                    aria-pressed={guide()}
                    onClick={() => setGuide((value) => !value)}
                  >
                    <Icon name={guide() ? 'eye' : 'eyeOff'} size={16} />
                    Guía
                  </button>
                  <button
                    type="button"
                    class="btn-quiet h-11 px-4 text-sm shadow-none"
                    disabled={!open()}
                    onClick={() => props.actions.answer({ answer: null, optionId: null })}
                  >
                    Saltar
                  </button>
                </div>
              }
            >
              <div class="flex h-11 items-center justify-center gap-2">
                <button type="button" class="btn-quiet h-11 px-4 text-sm shadow-none" disabled={!open()} onClick={askStroke}>
                  <Icon name="hint" size={16} />
                  Pista
                </button>
                <button type="button" class="btn-quiet h-11 px-4 text-sm shadow-none" disabled={!open() || outline()} onClick={askOutline}>
                  <Icon name="eye" size={16} />
                  Contorno
                </button>
              </div>
              <p class="text-center text-xs text-ink-soft">Con una pista, este repaso cuenta como Otra vez.</p>
            </Show>
          </div>
        }
      >
        {(shown) => (
          <div class="mt-3 animate-rise space-y-3">
            <div class="flex items-center gap-3 px-1">
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                classList={{
                  'bg-ink text-paper': shown().outcome === 'correct' && shown().rating !== 'again',
                  'bg-ink/10 text-ink-soft': shown().outcome !== 'correct' || shown().rating === 'again',
                }}
              >
                <Icon name="check" size={20} />
              </div>
              <div class="min-w-0 flex-1 leading-tight">
                <p class="font-display text-lg font-semibold">{resultTitle()}</p>
                <p class="text-xs text-ink-soft">{resultDetail()}</p>
                <Show when={scheduleNote(shown(), false)}>{(note) => <p class="mt-0.5 text-xs text-ink-soft">{note()}</p>}</Show>
              </div>
            </div>
            <button type="button" class="btn-ink h-14 w-full" onClick={() => props.actions.continue()}>
              Continuar
              <Icon name="next" size={18} />
            </button>
          </div>
        )}
      </Show>
    </>
  );
};

type ExerciseKind = Extract<ExerciseSelection, { kind: 'exercise' }>;

/**
 * The card of a Trazos session: watch on a teaching exposure, trace on practice, write from memory
 * on a scheduled card. It reports what the learner does and never decides a result. Space continues
 * from a watched character or a result.
 */
const WritingCard: Component<WritingCardProps> = (props) => {
  const cardId = createMemo(() => {
    const selection = props.view.selection;
    if (!selection) return null;
    return selection.kind === 'exercise' ? selection.exercise.id : selection.card.id;
  });
  const exercise = (): ExerciseKind | null => (props.view.selection?.kind === 'exercise' ? props.view.selection : null);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code !== 'Space' || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement) return;
    const view = props.view;
    if (view.state === 'feedback' || (view.state === 'presenting' && view.selection?.kind === 'exposure')) {
      event.preventDefault();
      props.actions.continue();
    }
  };
  window.addEventListener('keydown', onKeyDown);
  onCleanup(() => window.removeEventListener('keydown', onKeyDown));

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      {/* Each card mounts a fresh canvas, so a requeued card on the same character starts a new quiz. */}
      <Show when={cardId()} keyed>
        <Switch>
          <Match when={props.view.selection?.kind === 'exposure' && props.view.selection}>
            {(selection) => (
              <WatchCard card={(selection() as Extract<ExerciseSelection, { kind: 'exposure' }>).card} view={props.view} actions={props.actions} />
            )}
          </Match>
          <Match when={exercise()?.exercise.format === 'writing' && exercise()!.exercise.answer}>
            <DrawCard exercise={exercise()!.exercise} view={props.view} actions={props.actions} />
          </Match>
          <Match when={exercise()}>
            <div class="m-auto text-center text-ink-soft">Esta tarjeta no es de escritura.</div>
          </Match>
        </Switch>
      </Show>
    </div>
  );
};

export default WritingCard;
