import {
  Component,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import SpeakButton from '../components/SpeakButton';
import { glossHead } from '../utils/glossDisplay';
import Icon from '../components/Icon';
import SegmentedPicker from '../components/SegmentedPicker';
import Pinyin from '../components/Pinyin';
import StrokeCanvas, { StrokeCanvasApi } from '../components/StrokeCanvas';
import { charactersInTopic } from '../data/topics';
import { characterStore } from '../stores/characterStore';
import { extraVocabulary } from '../data/vocabulary';
import { Grade, progressStore } from '../stores/progressStore';
import { spokenMeaning } from '../utils/meaning';
import { canSpeak } from '../utils/speech';
import { shouldHandleShortcut } from '../utils/keyboard';
import type { StrokeFocus } from '../screen';
import type { HSKCharacter } from '../types';
import { characterOrWordStub } from '../utils/wordCharacter';

/** What the stroke page shows of a character. HSK rows have more; a character outside HSK has only this. */
type StrokeCharacter = Pick<HSKCharacter, 'character' | 'pinyin' | 'stroke_count' | 'definition' | 'gloss' | 'example'>;

/** A character the deck does not hold: a level not studied, or no level at all. */
const loneCharacter = (char: string): StrokeCharacter =>
  characterOrWordStub(char, characterStore.state.characters) ?? { character: char, pinyin: '', stroke_count: 0, definition: '' };

/** watch the order, trace over the guide, then write from memory. */
export type StrokeStage = 'watch' | 'trace' | 'memory';

interface TrazosProps {
  onBack: (char?: string) => void;
  backLabel?: string;
  focus: StrokeFocus;
}

const STAGES: { value: StrokeStage; label: string }[] = [
  { value: 'watch', label: 'Ver' },
  { value: 'trace', label: 'Calcar' },
  { value: 'memory', label: 'De memoria' },
];

const memoryGrade = (mistakes: number): Grade =>
  mistakes === 0 ? 'good' : mistakes <= 2 ? 'hard' : 'again';

const Trazos: Component<TrazosProps> = (props) => {
  const characters = (): StrokeCharacter[] => {
    const focus = props.focus;
    switch (focus.kind) {
      case 'topic': {
        const base = charactersInTopic(focus.topicId, characterStore.state.characters);
        const seen = new Set(base.map((row) => row.character));
        // Extra words tagged with this topic add their characters after the catalog ones.
        const extras: StrokeCharacter[] = [];
        for (const word of extraVocabulary) {
          if (!word.topicIds.includes(focus.topicId)) continue;
          for (const char of word.characters) {
            if (seen.has(char)) continue;
            seen.add(char);
            extras.push(loneCharacter(char));
          }
        }
        return [...base, ...extras];
      }
      case 'character': {
        const deck = characterStore.getCharactersByLevel();
        return deck.some((row) => row.character === focus.char) ? deck : [loneCharacter(focus.char)];
      }
      case 'level':
        return characterStore.getCharactersByLevel();
      default: {
        const _exhaustive: never = focus;
        return _exhaustive;
      }
    }
  };
  const startIndex = () => {
    const focus = props.focus;
    const initial = focus.kind === 'level' ? undefined : focus.char;
    const i = characters().findIndex((c) => c.character === initial);
    return i >= 0
      ? i
      : Math.min(characterStore.state.currentIndex, Math.max(0, characters().length - 1));
  };

  const [index, setIndex] = createSignal(startIndex());
  const [stage, setStage] = createSignal<StrokeStage>('watch');
  const [strokeCount, setStrokeCount] = createSignal(0);
  const [step, setStep] = createSignal<number | null>(null);
  const [animating, setAnimating] = createSignal(false);
  const [showGuide, setShowGuide] = createSignal(true);
  const [done, setDone] = createSignal(0);
  const [mistakes, setMistakes] = createSignal(0);
  const [missedStrokes, setMissedStrokes] = createSignal<number[]>([]);
  const [result, setResult] = createSignal<{
    mistakes: number;
    best: number | null;
    stage: StrokeStage;
  } | null>(null);
  const [shake, setShake] = createSignal(false);
  // Points at Calcar once the first animation has played.
  const [nudge, setNudge] = createSignal(false);
  let nudged = false;
  let canvas: StrokeCanvasApi | undefined;

  const current = createMemo(() => characters()[index()]);
  const total = () => characters().length;
  const count = () => strokeCount() || current()?.stroke_count || 0;

  const resetRun = () => {
    setStep(null);
    setDone(0);
    setMistakes(0);
    setMissedStrokes([]);
    setResult(null);
  };

  const go = (delta: number) => {
    const next = index() + delta;
    if (next < 0 || next >= total()) return;
    resetRun();
    setStrokeCount(0);
    setIndex(next);
  };

  const switchStage = (next: StrokeStage) => {
    if (next === stage()) return;
    const wasWriting = stage() !== 'watch';
    resetRun();
    setStage(next);
    setShowGuide(next === 'trace');
    // Moving between the two writing stages keeps the canvas in quiz mode, so restart it by hand.
    if (wasWriting && next !== 'watch') canvas?.restartQuiz();
  };

  const play = () => {
    setStep(null);
    canvas?.play();
  };

  const stepBy = (delta: number) => {
    const n = count();
    if (n < 2 && delta > 0 && step() === null) return;
    if (n === 0) return;
    const s = step();
    if (delta < 0) {
      if (s === null || s === 0) setStep(null);
      else setStep(s - 1);
      return;
    }
    if (s === null) setStep(0);
    else setStep(Math.min(n - 1, s + 1));
  };

  const restart = () => {
    resetRun();
    canvas?.restartQuiz();
  };

  const handleReady = (n: number) => {
    setStrokeCount(n);
    if (stage() === 'watch') play();
  };

  const handleComplete = (totalMistakes: number) => {
    const char = current()?.character;
    if (!char) return;
    const before = progressStore.get(char)?.strokeBest ?? null;
    progressStore.recordStrokes(char, totalMistakes);
    // Only a due character moves the schedule; extra practice here must not inflate intervals.
    if (stage() === 'memory') {
      if (progressStore.isDue(char)) progressStore.grade(char, memoryGrade(totalMistakes));
      else progressStore.practice(char, totalMistakes <= 2);
    }
    setDone(count());
    setTimeout(() => setResult({ mistakes: totalMistakes, best: before, stage: stage() }), 350);
  };

  const handleMistake = (strokeNum: number, total: number) => {
    setMistakes(total);
    setMissedStrokes((m) => (m.includes(strokeNum) ? m : [...m, strokeNum]));
    setShake(true);
    setTimeout(() => setShake(false), 400);
  };

  const onKey = (e: KeyboardEvent) => {
    if (!shouldHandleShortcut(e)) return;
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === ' ' && stage() === 'watch') {
      e.preventDefault();
      play();
    }
  };

  onMount(() => window.addEventListener('keydown', onKey));
  onCleanup(() => window.removeEventListener('keydown', onKey));

  const strokeLine = () => {
    const n = count();
    const currentStep = step();
    if (stage() === 'watch' && currentStep !== null) return `Trazo ${currentStep + 1} de ${n}`;
    if (stage() !== 'watch' && done() > 0) return `Trazo ${Math.min(done() + 1, n)} de ${n}`;
    return `${n} ${n === 1 ? 'trazo' : 'trazos'}`;
  };

  const beatBest = (mistakes: number, best: number | null) => best !== null && mistakes < best;

  const resultTitle = (r: { mistakes: number; stage: StrokeStage }) => {
    if (r.mistakes === 0) return r.stage === 'memory' ? 'De memoria, perfecto' : 'Perfecto';
    return r.mistakes <= 2 ? 'Muy bien' : 'Completado';
  };

  return (
    <div class="screen">
      <header class="flex items-center gap-1 h-11 flex-shrink-0 -ml-1 animate-rise">
        <button
          onClick={() => props.onBack(current()?.character)}
          class="btn-ghost h-11 shrink-0 gap-0.5 px-2"
        >
          <Icon name="back" size={20} />
          <span class="text-sm font-medium">{props.backLabel ?? 'Volver'}</span>
        </button>
        <div class="flex min-w-0 flex-1 items-center justify-center">
          <span class="truncate text-sm font-medium tabular-nums text-ink">
            <Show when={current()}>{strokeLine()}</Show>
          </span>
          <Show when={stage() !== 'watch' && mistakes() > 0}>
            <span class="ml-2 shrink-0 rounded-full bg-seal-soft px-2 py-0.5 text-xs font-semibold tabular-nums text-seal">
              {mistakes()} {mistakes() === 1 ? 'error' : 'errores'}
            </span>
          </Show>
        </div>
        <Show when={canSpeak() && current()}>
          {(char) => <SpeakButton pinyin={char().pinyin} hanzi={char().character} />}
        </Show>
      </header>

      <Show
        when={current()}
        fallback={<p class="m-auto text-ink-soft animate-rise [animation-delay:60ms]">No hay caracteres en este nivel.</p>}
      >
        {(char) => (
          <div class="flex-1 flex flex-col min-h-0 pb-2 animate-rise [animation-delay:60ms]">
            <div class="flex min-h-0 flex-1 flex-col justify-center">
            <div class="shrink-0 px-2 pt-3 text-center">
              <p class="font-sans text-2xl font-semibold leading-tight text-balance">
                {glossHead(spokenMeaning(char())).replace(/^./, (letter) => letter.toUpperCase())}
              </p>
              <Pinyin text={char().pinyin} class="mt-1 text-xl font-medium" />
            </div>
            <div class="relative mt-6 shrink-0" classList={{ 'animate-shake': shake() }}>
              <div
                class="pointer-events-none absolute inset-0 z-10 rounded-card ring-4 ring-seal/70 transition-opacity duration-300"
                classList={{ 'opacity-100': shake(), 'opacity-0': !shake() }}
                aria-hidden="true"
              />
              <div
                class="w-full"
                onClick={() => {
                  if (stage() === 'watch' && step() === null) play();
                }}
              >
              <StrokeCanvas
                char={char().character}
                mode={stage() === 'watch' ? 'watch' : 'write'}
                step={step()}
                showOutline={stage() === 'watch' || showGuide()}
                ghost={stage() === 'trace' && !showGuide()}
                startHint={stage() === 'trace' && showGuide() ? 'always' : 'never'}
                onReady={handleReady}
                onAnimating={(a) => {
                  if (!a && animating() && !nudged && stage() === 'watch') {
                    nudged = true;
                    setNudge(true);
                    setTimeout(() => setNudge(false), 2400);
                  }
                  setAnimating(a);
                }}
                onStroke={(d, m) => {
                  setDone(d);
                  setMistakes(m);
                }}
                onMistake={handleMistake}
                onComplete={handleComplete}
                api={(api) => (canvas = api)}
              />
              </div>
            </div>
            </div>
            <div class="flex shrink-0 flex-col">
            <SegmentedPicker
              class="mt-4 shrink-0"
              label="Modo de práctica"
              options={STAGES.map((s) => ({ ...s, class: s.value === 'trace' && nudge() ? 'animate-nudge' : '' }))}
              value={stage()}
              onChange={(value: StrokeStage) => {
                if (value === 'watch' && stage() === 'watch') setStep(null);
                else switchStage(value);
              }}
            />

            <div class="mt-4 flex min-h-[6.75rem] shrink-0 flex-col justify-end gap-4">
              <Show when={stage() === 'watch'}>
                <div class="flex h-11 items-center justify-center gap-2">
                  <Show
                    when={step() === null}
                    fallback={
                      <>
                        <button
                          onClick={() => stepBy(-1)}
                          disabled={step() === 0}
                          class="inline-flex h-11 flex-1 items-center justify-center text-sm"
                          classList={{
                            'btn-quiet shadow-none': step() !== 0,
                            'text-ink/40': step() === 0,
                          }}
                        >
                          Anterior
                        </button>
                        <Show when={(step() ?? 0) < count() - 1}>
                          <button
                            type="button"
                            class="btn-quiet h-11 w-24 shrink-0 text-sm shadow-none"
                            onClick={() => setStep(null)}
                          >
                            Cerrar
                          </button>
                        </Show>
                        <Show
                          when={(step() ?? 0) < count() - 1}
                          fallback={
                            <button
                              type="button"
                              class="btn-ink h-11 flex-1 text-sm"
                              onClick={() => setStep(null)}
                            >
                              Cerrar
                            </button>
                          }
                        >
                          <button onClick={() => stepBy(1)} class="btn-ink h-11 flex-1 text-sm">
                            Siguiente
                          </button>
                        </Show>
                      </>
                    }
                  >
                    <Show when={count() > 1}>
                      <button onClick={() => stepBy(1)} class="btn-quiet h-11 w-40 text-sm shadow-none">
                        <Icon name="play" size={16} />
                        Paso a paso
                      </button>
                    </Show>
                  </Show>
                </div>
              </Show>

              <Show when={stage() !== 'watch'}>
                <Show
                  when={result()}
                    fallback={
                    <>
                      <Show when={stage() === 'trace'}>
                        <div class="flex h-11 items-center justify-center gap-2">
                          <button
                            onClick={() => setShowGuide((v) => !v)}
                            class="btn-quiet h-11 w-40 text-sm shadow-none"
                            classList={{ 'border-ink bg-ink font-semibold text-paper': showGuide() }}
                            aria-pressed={showGuide()}
                          >
                            <Icon name={showGuide() ? 'eye' : 'eyeOff'} size={16} />
                            Guía
                          </button>
                          <Show when={done() > 0}>
                            <button onClick={restart} class="btn-quiet h-11 px-4 text-sm shadow-none">
                              <Icon name="replay" size={16} />
                              Reiniciar
                            </button>
                          </Show>
                        </div>
                      </Show>
                      <Show when={stage() === 'memory'}>
                        <div class="flex h-11 items-center justify-center gap-2">
                          <button onClick={() => canvas?.hint()} class="btn-quiet h-11 w-40 text-sm shadow-none">
                            <Icon name="hint" size={16} />
                            Pista
                          </button>
                          <Show when={done() > 0}>
                            <button onClick={restart} class="btn-quiet h-11 px-4 text-sm shadow-none">
                              Reiniciar
                            </button>
                          </Show>
                        </div>
                      </Show>
                    </>
                  }
                >
                  {(r) => (
                    <div class="animate-rise space-y-3">
                      <div class="flex items-center gap-3 px-1">
                        <div
                          class="h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0"
                          classList={{
                            'bg-ink text-paper': r().mistakes <= 2,
                            'bg-ink/10 text-ink-soft': r().mistakes > 2,
                          }}
                        >
                          <Icon name="check" size={20} />
                        </div>
                        <div class="flex-1 min-w-0 leading-tight">
                          <div class="font-display text-lg font-semibold">{resultTitle(r())}</div>
                          <div class="text-xs text-ink-soft">
                            {r().mistakes === 0
                              ? 'Sin errores'
                              : `${r().mistakes} ${r().mistakes === 1 ? 'error' : 'errores'} · revisa ${
                                  missedStrokes().length === 1 ? 'el trazo' : 'los trazos'
                                } ${missedStrokes()
                                  .sort((a, b) => a - b)
                                  .map((n) => n + 1)
                                  .join(', ')}`}
                            {beatBest(r().mistakes, r().best) ? ' · ¡nuevo récord!' : ''}
                          </div>
                        </div>
                      </div>
                      <div class="grid grid-cols-[auto_1fr] gap-2">
                        <button onClick={restart} class="btn-quiet h-[3.25rem] px-4 text-sm">
                          <Icon name="replay" size={18} />
                          Repetir
                        </button>
                        <Show
                          when={r().stage === 'trace'}
                          fallback={
                            <button
                              onClick={() => go(1)}
                              class="btn-ink h-[3.25rem] text-[0.9375rem]"
                              disabled={index() >= total() - 1}
                            >
                              Siguiente carácter
                              <Icon name="next" size={18} />
                            </button>
                          }
                        >
                          <button
                            onClick={() => switchStage('memory')}
                            class="btn-ink h-[3.25rem] text-[0.9375rem]"
                          >
                            Ahora de memoria
                            <Icon name="next" size={18} />
                          </button>
                        </Show>
                      </div>
                    </div>
                  )}
                </Show>
              </Show>
            </div>

            {/* Character navigation; no preview, so the next one stays a surprise in De memoria */}
            <Show when={props.focus.kind !== 'character'}>
            <nav
              class="mt-4 flex h-11 items-center justify-between"
              classList={{ 'invisible pointer-events-none': step() !== null }}
              aria-hidden={step() !== null}
            >
              <Show
                when={index() > 0}
                fallback={<span class="h-11 w-11" />}
              >
                <button
                  onClick={() => go(-1)}
                  class="btn-ghost h-11 w-11"
                  aria-label="Carácter anterior"
                >
                  <Icon name="prev" size={18} />
                </button>
              </Show>
              <span class="text-sm text-ink-soft tabular-nums">
                {index() + 1} de {total()}
              </span>
              <button
                onClick={() => go(1)}
                disabled={index() >= total() - 1}
                class="btn-ghost h-11 w-11"
                aria-label="Carácter siguiente"
              >
                <Icon name="next" size={18} />
              </button>
            </nav>
            </Show>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
};

export default Trazos;
