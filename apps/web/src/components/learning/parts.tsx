import { Component, createEffect, createSignal, For, JSX, onCleanup, Show } from 'solid-js';
import Icon from '../Icon';
import Pinyin from '../Pinyin';
import RiceGrid from '../RiceGrid';
import SpeakButton from '../SpeakButton';
import type { Hint, Rating, RevealedAnswer, SpeechAudio } from '@jiayou/learning/types';
import type { LearningSessionView } from './types';
import { RATING_CAPTION, RATING_KEY, RATING_LABEL, feedbackLabel, feedbackTone, scheduleNote } from './present';

/**
 * The word written large, one rice-grid square per character, as the review card draws it. Each
 * square takes the card's width divided by the characters (container units, so any phone and any
 * word length fill the card), capped by a height that leaves room for the rest: on a 568 px screen
 * the question and its options keep their space. Once the answer is shown (`onCharacter`), each
 * character opens its sheet.
 */
export const HanziBlock: Component<{ characters: string; compact?: boolean; onCharacter?: (char: string) => void }> = (props) => {
  const chars = () => Array.from(props.characters);
  // Answered, the card no longer holds the question, so the word may take more of the height.
  const tallest = () => (props.compact ? 'max(5rem, min(30dvh, 100dvh - 26rem))' : 'max(5rem, min(38dvh, 100dvh - 30rem))');
  const side = () => `min(calc(100cqw / ${chars().length}), ${tallest()})`;
  const glyph = (char: string) => (
    <>
      <RiceGrid class="absolute inset-0 h-full w-full" frame={false} />
      <span aria-hidden="true" class="relative font-hanzi leading-none" style={{ 'font-size': 'calc(var(--side) * 0.88)' }}>{char}</span>
    </>
  );
  const cell = 'relative flex shrink-0 items-center justify-center';
  return (
    // The outer box is the container the squares measure; the row inside holds them.
    <div class="w-full shrink-0 [container-type:inline-size]">
      <div
        class="flex w-full items-center justify-center"
        style={{ '--side': side() }}
        role={props.onCharacter ? 'group' : 'img'}
        aria-label={props.characters}
        lang="zh-CN"
      >
        <For each={chars()}>{(char) => (
          <Show when={props.onCharacter} fallback={<span class={cell} style={{ width: 'var(--side)', height: 'var(--side)' }}>{glyph(char)}</span>}>
            <button
              type="button"
              class={`${cell} rounded-tile transition-transform active:scale-[0.96] hover:bg-line/20`}
              style={{ width: 'var(--side)', height: 'var(--side)' }}
              aria-label={`Ver el carácter ${char}: trazos y palabras`}
              onClick={() => props.onCharacter?.(char)}
            >{glyph(char)}</button>
          </Show>
        )}</For>
      </div>
    </div>
  );
};

/** A listen button, only when the device can speak and the card carries audio. */
export const AudioButton: Component<{
  audio: SpeechAudio | null;
  speechAvailable: boolean;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  class?: string;
  onUnavailable: () => void;
}> = (props) => (
  <Show when={props.speechAvailable && props.audio}>{(audio) => (
    <SpeakButton
      word
      size={props.size}
      class={props.class}
      label={props.label}
      pinyin={audio().pinyin}
      hanzi={audio().hanzi}
      onUnavailable={props.onUnavailable}
    />
  )}</Show>
);

/** The answer as the card stored it: reading, meaning and its sound. The page's details go under the result. */
export const AnswerPanel: Component<{
  answer: RevealedAnswer;
  audio: SpeechAudio | null;
  speechAvailable: boolean;
}> = (props) => {
  // The answer's sound is extra: when it fails the card still counts, so the panel only says so.
  const [audioFailed, setAudioFailed] = createSignal(false);
  return (
    <>
      {/* The sound sits beside the reading it plays, so the meaning comes one line sooner on a small phone. */}
      <div class="mt-2 flex items-center justify-center gap-2">
        <Pinyin word text={props.answer.pinyin} class="text-2xl font-medium" />
        <AudioButton audio={props.audio} speechAvailable={props.speechAvailable} size="sm" onUnavailable={() => setAudioFailed(true)} />
      </div>
      <p class="mt-1 text-2xl font-semibold leading-snug text-balance first-letter:uppercase">{props.answer.meaning}</p>
      <Show when={audioFailed()}>
        <p role="status" class="mt-2 text-sm text-seal">No se pudo reproducir el audio. Comprueba la voz china del dispositivo.</p>
      </Show>
    </>
  );
};

/** Hints already taken, with what they showed. */
export const TakenHints: Component<{ hints: readonly Hint[] }> = (props) => (
  <For each={props.hints.filter((hint) => hint.value)}>{(hint) => (
    <p class="mt-3 inline-flex items-center gap-1.5 rounded-full bg-paper/70 px-3 py-1 text-sm text-ink-soft">
      <Icon name="hint" size={14} />
      <Show when={hint.kind === 'pinyin'} fallback={<span>{hint.value}</span>}>
        <Pinyin word text={hint.value!} class="font-medium" />
      </Show>
    </p>
  )}</For>
);

/** The on-demand hint. Says up front when taking it means the card no longer counts as known. */
export const HintButton: Component<{ hint: Hint; disabled: boolean; onHint: (hint: Hint) => void; class?: string }> = (props) => (
  <button
    type="button"
    class={`btn-ghost h-11 px-4 text-sm ${props.class ?? 'mt-3'}`}
    disabled={props.disabled}
    aria-label={props.hint.revealsAnswer ? 'Ver el pinyin. Da la respuesta' : 'Ver el pinyin'}
    onClick={() => props.onHint(props.hint)}
  >
    <Icon name="hint" size={16} />
    Ver el pinyin
  </button>
);

/** The colour that names each rating: a dot on an option, the fill of the chosen one. */
const RATING_DOT: Record<Rating, string> = { again: 'bg-seal', hard: 'bg-ink-soft', good: 'bg-jade', easy: 'bg-jade/60' };
const RATING_FILL: Record<Rating, string> = {
  again: 'bg-seal text-white dark:text-paper',
  hard: 'bg-ink text-paper',
  good: 'bg-jade text-white dark:text-paper',
  easy: 'bg-jade text-white dark:text-paper',
};

/**
 * Otra vez, Difícil, Bien and, when the session allows it, Fácil, as one choice: the options sit
 * together in a tray and look alike, each with its colour as a dot, so none reads as already chosen.
 * Tapping one rates at once. Each says what it means under its name: Difícil is a recall that took
 * effort, not a near miss.
 */
export const RatingButtons: Component<{
  allowEasy: boolean;
  disabled: boolean;
  onRate: (rating: Rating) => void;
  /**
   * After "Ya la sé" the learner already said they know it: Bien comes chosen, filled, and is rated
   * for them when the line on it runs out, unless they touch the card (`held`) and pick another.
   */
  autoGood?: boolean;
  held?: boolean;
}> = (props) => {
  const ratings = (): Rating[] => (props.allowEasy ? ['again', 'hard', 'good', 'easy'] : ['again', 'hard', 'good']);
  const { running, left } = createCountdown(() => !!props.autoGood && !props.held && !props.disabled, () => props.onRate('good'));
  const chosen = (rating: Rating) => !!props.autoGood && rating === 'good';
  return (
    <div class="animate-fade">
      <div
        class="grid gap-1 rounded-[1.375rem] border border-line bg-ink/[0.04] p-1"
        style={{ 'grid-template-columns': `repeat(${ratings().length}, minmax(0, 1fr))` }}
        role="group"
        aria-label="¿Lo recordabas?"
      >
        <For each={ratings()}>{(rating) => (
          <button
            type="button"
            class="relative flex h-16 min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[1.0625rem] px-1.5 transition-colors active:scale-[0.98] disabled:opacity-60"
            classList={{
              [RATING_FILL[rating]]: chosen(rating),
              'shadow-lift': chosen(rating),
              'bg-surface text-ink shadow-sm hover:bg-paper': !chosen(rating),
            }}
            disabled={props.disabled}
            aria-pressed={chosen(rating) ? 'true' : undefined}
            aria-describedby={chosen(rating) && running() ? 'auto-rate-note' : undefined}
            aria-label={`${RATING_LABEL[rating]}. ${RATING_CAPTION[rating]}`}
            aria-keyshortcuts={RATING_KEY[rating]}
            onClick={() => props.onRate(rating)}
          >
            <span class="relative z-10 inline-flex items-center gap-1.5 text-[0.9375rem] font-semibold">
              <Show when={chosen(rating)} fallback={<span class={`h-2 w-2 shrink-0 rounded-full ${RATING_DOT[rating]}`} aria-hidden="true" />}>
                <Icon name="check" size={15} />
              </Show>
              {RATING_LABEL[rating]}
            </span>
            <span class="relative z-10 max-w-full text-[0.6875rem] font-medium leading-tight opacity-75">{RATING_CAPTION[rating]}</span>
            <Show when={chosen(rating) && running()}><DrainLine left={left()} fill /></Show>
          </button>
        )}</For>
      </div>
      <span id="auto-rate-note" class="sr-only" aria-live="polite">
        <Show when={running()}>Bien en {left()} segundos.</Show>
      </span>
    </div>
  );
};

const TONE_CLASS = {
  good: 'bg-jade/15 text-jade',
  neutral: 'bg-ink/10 text-ink',
  miss: 'bg-seal/15 text-seal',
} as const;

/** The result and whether it moved the schedule. */
export const FeedbackNote: Component<{
  feedback: NonNullable<LearningSessionView['feedback']>;
  audioCue: boolean;
  /** "No lo sé": nothing was guessed, so there is no verdict to show, only the answer. */
  unknown?: boolean;
  /** A sentence that names the mix-up, shown instead of the pill after a wrong option. */
  mixUp?: JSX.Element;
}> = (props) => (
  <div role="status" class="mb-2 flex flex-col items-center gap-1.5 animate-pop">
    <Show when={props.mixUp} fallback={
      <Show when={props.feedback.recorded !== 'exposure' && !(props.unknown && props.feedback.recorded === 'practice')}>
        <p class={`inline-flex h-8 items-center rounded-full px-3 text-sm font-semibold [@media(max-height:640px)]:h-7 ${TONE_CLASS[feedbackTone(props.feedback)]}`}>
          {feedbackLabel(props.feedback)}
        </p>
      </Show>
    }>
      <p class="max-w-[19rem] rounded-xl bg-seal-soft/60 px-4 py-2 text-sm leading-snug text-ink">{props.mixUp}</p>
    </Show>
    {/* Practice says so once, in the summary: on every card it is noise. A miss only says it comes back. */}
    <Show when={props.feedback.recorded === 'practice' ? (props.feedback.outcome === 'incorrect' ? 'Vuelve en unas tarjetas.' : null) : scheduleNote(props.feedback, props.audioCue)}>{(note) => <p class="text-sm text-ink-soft">{note()}</p>}</Show>
  </div>
);

/** Seconds a known answer stays up before the next card. */
export const AUTO_CONTINUE_SECONDS = 4;

/**
 * The learner's hold on an answered card. Touching, scrolling or wheeling the card after the answer
 * stops the auto-continue for good on that card; touches before the answer (picking an option) do not.
 */
export const createHold = (answered: () => boolean) => {
  const [held, setHeld] = createSignal(false);
  const hold = () => { if (answered()) setHeld(true); };
  return { held, hold, sheetHandlers: { onPointerDown: hold, onScroll: hold, onWheel: hold } };
};

/**
 * Counts AUTO_CONTINUE_SECONDS down while `active` holds, in whole seconds so reduced motion gets the
 * same timing, and calls `onDone` at zero. Leaving the app stops it for good.
 */
export const createCountdown = (active: () => boolean, onDone: () => void) => {
  const [away, setAway] = createSignal(false);
  const [left, setLeft] = createSignal(AUTO_CONTINUE_SECONDS);
  const running = () => active() && !away();
  const onVisibility = () => { if (document.hidden) setAway(true); };
  document.addEventListener('visibilitychange', onVisibility);
  let tick: ReturnType<typeof setInterval> | undefined;
  createEffect(() => {
    if (tick) clearInterval(tick);
    tick = undefined;
    if (!running()) return;
    tick = setInterval(() => {
      if (!running()) return;
      const next = left() - 1;
      setLeft(next);
      if (next <= 0) {
        clearInterval(tick);
        onDone();
      }
    }, 1000);
  });
  onCleanup(() => {
    if (tick) clearInterval(tick);
    document.removeEventListener('visibilitychange', onVisibility);
  });
  return { running, left };
};

/**
 * What drains on a button that will press itself. On a wide button, a line on its top edge; on a
 * small filled one (`fill`), a lighter layer over the whole button that empties from the right,
 * because a thin line there is cut by the rounded corners.
 */
const DrainLine: Component<{ left: number; fill?: boolean }> = (props) => (
  <span
    aria-hidden="true"
    data-testid="auto-continue"
    class={`pointer-events-none absolute origin-left ${props.fill ? 'inset-0 bg-white/25 dark:bg-paper/25' : 'inset-x-0 top-0 h-1 bg-jade'}`}
    style={reducedMotion()
      ? { transform: `scaleX(${props.left / AUTO_CONTINUE_SECONDS})` }
      : { animation: `drain ${AUTO_CONTINUE_SECONDS}s linear forwards` }}
  />
);

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Continuar after an answer. When the learner knew it (`auto`), a line drains along the button's top
 * edge and the card moves on by itself. Touching or scrolling the card (`held`) or leaving the app
 * stops it; Continuar then waits for a tap.
 */
export const ContinueButton: Component<{ auto: boolean; held: boolean; disabled: boolean; onContinue: () => void }> = (props) => {
  const { running, left } = createCountdown(() => props.auto && !props.held && !props.disabled, () => props.onContinue());
  // The line drains along the top of Continuar, so the bottom never changes height between cards.
  return (
    <>
    <span id="auto-continue-note" class="sr-only" aria-live="polite">
      <Show when={running()} fallback={props.auto && !props.disabled ? 'La tarjeta espera.' : ''}>Sigue sola en {left()} segundos.</Show>
    </span>
    <button
      type="button"
      class="btn-ink relative h-14 w-full overflow-hidden"
      disabled={props.disabled}
      aria-describedby={running() ? 'auto-continue-note' : undefined}
      onClick={() => props.onContinue()}
    >
      Continuar
      <Show when={running()}><DrainLine left={left()} /></Show>
    </button>
    </>
  );
};

/**
 * Taps on a card's own answer buttons count only after this long, so a quick second tap on
 * Continuar does not land on the next card's "No lo sé" or "Ya la sé" in the same spot.
 */
export const createArmed = (ms = import.meta.env.MODE === 'test' ? 0 : 400) => {
  const [armed, setArmed] = createSignal(ms === 0);
  const timer = setTimeout(() => setArmed(true), ms);
  onCleanup(() => clearTimeout(timer));
  return armed;
};

/**
 * The card and, once answered, the whole word under it. They scroll together while the actions stay
 * fixed below. The question fills the screen; the answer shrinks to its content so the word's sheet
 * shows up under it, and an arrow at the card's foot scrolls there. Touching or scrolling after the
 * answer holds the auto-continue.
 */
export const CardScroll: Component<{ answered: boolean; showDetails: boolean; details?: JSX.Element; onHold: () => void; children: JSX.Element }> = (props) => {
  let scroller: HTMLDivElement | undefined;
  let below: HTMLDivElement | undefined;
  const hold = () => { if (props.answered) props.onHold(); };
  const withDetails = () => props.showDetails && !!props.details;
  /** The arrow shows only while part of the word's sheet is out of sight. */
  const [more, setMore] = createSignal(false);
  const measure = () => { if (scroller) setMore(scroller.scrollHeight - scroller.clientHeight > 8); };
  createEffect(() => {
    withDetails();
    if (!scroller || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    for (const child of Array.from(scroller.children)) observer.observe(child);
    measure();
    onCleanup(() => observer.disconnect());
  });
  return (
    <div
      ref={scroller}
      class="min-h-0 flex-1 overflow-y-auto overscroll-contain [mask-image:linear-gradient(to_bottom,black_calc(100%-1.5rem),transparent)]"
      onPointerDown={hold}
      onScroll={hold}
      onWheel={hold}
      data-testid="card-scroll"
    >
      <div
        class="sheet my-3 flex flex-col items-center p-4 text-center [@media(max-height:640px)]:my-2 [@media(max-height:640px)]:p-3"
        classList={{ 'min-h-[calc(100%-1.5rem)] justify-start [justify-content:safe_center]': !withDetails() }}
      >
        {props.children}
        <Show when={withDetails() && more()}>
          <button
            type="button"
            class="btn-ghost mt-1 h-10 w-11 rounded-full text-ink-soft"
            aria-label="Ver la ficha de la palabra"
            onClick={() => {
              props.onHold();
              if (scroller && below) scroller.scrollTo({ top: below.offsetTop - scroller.offsetTop - 8, behavior: reducedMotion() ? 'auto' : 'smooth' });
            }}
          ><Icon name="next" size={20} class="rotate-90" /></button>
        </Show>
      </div>
      <Show when={withDetails()}>
        <div ref={below} class="px-1 pb-6">{props.details}</div>
      </Show>
    </div>
  );
};
