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

/** The colour that names each rating, as a dot on its option. */
const RATING_DOT: Record<Rating, string> = { again: 'bg-seal', hard: 'bg-ink-soft', good: 'bg-jade', easy: 'bg-jade/60' };
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
}> = (props) => {
  const ratings = (): Rating[] => (props.allowEasy ? ['again', 'hard', 'good', 'easy'] : ['again', 'hard', 'good']);
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
            class="relative flex h-16 min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[1.0625rem] bg-surface px-1.5 text-ink shadow-sm transition-colors hover:bg-paper active:scale-[0.98] disabled:opacity-60"
            disabled={props.disabled}
            aria-label={`${RATING_LABEL[rating]}. ${RATING_CAPTION[rating]}`}
            aria-keyshortcuts={RATING_KEY[rating]}
            onClick={() => props.onRate(rating)}
          >
            <span class="relative z-10 inline-flex items-center gap-1.5 text-[0.9375rem] font-semibold">
              <span class={`h-2 w-2 shrink-0 rounded-full ${RATING_DOT[rating]}`} aria-hidden="true" />
              {RATING_LABEL[rating]}
            </span>
            <span class="relative z-10 max-w-full text-[0.6875rem] font-medium leading-tight opacity-75">{RATING_CAPTION[rating]}</span>
          </button>
        )}</For>
      </div>
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

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Continuar after a result. A right answer also moves on by itself; this skips the wait. */
export const ContinueButton: Component<{ disabled: boolean; onContinue: () => void }> = (props) => (
  <button type="button" class="btn-ink h-14 w-full" disabled={props.disabled} onClick={() => props.onContinue()}>Continuar</button>
);

/**
 * Turns true after `ms`. LearningCard holds every tap on a new card until then, so a quick second
 * tap on Continuar does not land on the next card's "Enséñamela", "Ya la sé" or "No lo sé".
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
 * shows up under it, and an arrow at the card's foot scrolls there.
 */
export const CardScroll: Component<{ showDetails: boolean; details?: JSX.Element; children: JSX.Element }> = (props) => {
  let scroller: HTMLDivElement | undefined;
  let below: HTMLDivElement | undefined;
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
