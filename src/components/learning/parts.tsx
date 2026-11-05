import { Component, createSignal, For, JSX, Show } from 'solid-js';
import Icon from '../Icon';
import Pinyin from '../Pinyin';
import RiceGrid from '../RiceGrid';
import SpeakButton from '../SpeakButton';
import type { Hint, Rating, RevealedAnswer, SpeechAudio } from '../../domain/learning/types';
import type { LearningSessionView } from './types';
import { RATING_CAPTION, RATING_KEY, RATING_LABEL, feedbackLabel, feedbackTone, scheduleNote } from './present';

/** The word written large, one rice-grid square per character, as the review card draws it. */
export const HanziBlock: Component<{ characters: string }> = (props) => {
  const chars = () => Array.from(props.characters);
  return (
    <div
      class="relative flex w-full shrink-0 items-center justify-center"
      style={{ 'max-width': 'min(19rem, 24dvh)' }}
      role="img"
      aria-label={props.characters}
      lang="zh-CN"
    >
      <For each={chars()}>{(char) => (
        <span class="relative flex aspect-square min-w-0 flex-1 items-center justify-center">
          <RiceGrid class="absolute inset-0 h-full w-full" frame={false} />
          <span
            aria-hidden="true"
            class="relative font-hanzi leading-none"
            style={{ 'font-size': `min(${chars().length === 1 ? '8rem' : '5.5rem'}, ${22 / chars().length}dvh, ${75 / chars().length}vw)` }}
          >{char}</span>
        </span>
      )}</For>
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

/** The answer as the card stored it: reading, meaning and its sound, then whatever the page adds. */
export const AnswerPanel: Component<{
  answer: RevealedAnswer;
  audio: SpeechAudio | null;
  speechAvailable: boolean;
  details?: JSX.Element;
}> = (props) => {
  // The answer's sound is extra: when it fails the card still counts, so the panel only says so.
  const [audioFailed, setAudioFailed] = createSignal(false);
  return (
    <>
      <Pinyin word text={props.answer.pinyin} class="mt-3 text-2xl font-medium" />
      <p class="mt-2 text-2xl font-semibold leading-snug text-balance first-letter:uppercase">{props.answer.meaning}</p>
      <AudioButton audio={props.audio} speechAvailable={props.speechAvailable} class="mt-2" onUnavailable={() => setAudioFailed(true)} />
      <Show when={audioFailed()}>
        <p role="status" class="mt-2 text-sm text-seal">No se pudo reproducir el audio. Comprueba la voz china del dispositivo.</p>
      </Show>
      {props.details}
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
export const HintButton: Component<{ hint: Hint; disabled: boolean; onHint: (hint: Hint) => void }> = (props) => (
  <button
    type="button"
    class="btn-ghost mt-3 h-11 px-4 text-sm"
    disabled={props.disabled}
    aria-label={props.hint.revealsAnswer ? 'Ver el pinyin. Da la respuesta' : 'Ver el pinyin'}
    onClick={() => props.onHint(props.hint)}
  >
    <Icon name="hint" size={16} />
    Ver el pinyin
  </button>
);

/** Bien is the filled accent: white on jade in light, paper on the lighter jade in dark. */
const RATING_CLASS: Record<Exclude<Rating, 'easy'>, string> = {
  again: 'btn-quiet',
  hard: 'btn-quiet',
  good: 'btn bg-jade text-white dark:text-paper shadow-lift hover:brightness-105',
};

/**
 * Otra vez, Difícil, Bien and, when the session allows it, Fácil. Each says what it means under its
 * name: Difícil is a recall that took effort, not a near miss.
 */
export const RatingButtons: Component<{ allowEasy: boolean; disabled: boolean; onRate: (rating: Rating) => void }> = (props) => {
  const ratings = (): Rating[] => (props.allowEasy ? ['again', 'hard', 'good', 'easy'] : ['again', 'hard', 'good']);
  const classFor = (rating: Rating) => (rating === 'easy' ? 'btn-quiet' : RATING_CLASS[rating]);
  return (
    <div
      class="grid gap-2 animate-fade"
      style={{ 'grid-template-columns': `repeat(${ratings().length}, minmax(0, 1fr))` }}
      role="group"
      aria-label="¿Lo recordabas?"
    >
      <For each={ratings()}>{(rating) => (
        <button
          type="button"
          class={`h-16 flex-col gap-0 px-2 ${classFor(rating)}`}
          disabled={props.disabled}
          aria-label={`${RATING_LABEL[rating]}. ${RATING_CAPTION[rating]}`}
          aria-keyshortcuts={RATING_KEY[rating]}
          onClick={() => props.onRate(rating)}
        >
          <span class="inline-flex items-center gap-1.5 text-[0.9375rem]">
            <Show when={rating === 'again'}><span class="h-2 w-2 flex-shrink-0 rounded-full bg-seal" aria-hidden="true" /></Show>
            <Show when={rating === 'good'}><Icon name="check" size={16} /></Show>
            {RATING_LABEL[rating]}
          </span>
          <span class="text-[0.6875rem] font-medium leading-tight opacity-75">{RATING_CAPTION[rating]}</span>
        </button>
      )}</For>
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
  /** A sentence that names the mix-up, shown instead of the pill after a wrong option. */
  mixUp?: JSX.Element;
}> = (props) => (
  <div role="status" class="mt-3 flex flex-col items-center gap-1.5 animate-pop">
    <Show when={props.mixUp} fallback={
      <Show when={props.feedback.recorded !== 'exposure'}>
        <p class={`inline-flex h-8 items-center rounded-full px-3 text-sm font-semibold ${TONE_CLASS[feedbackTone(props.feedback)]}`}>
          {feedbackLabel(props.feedback)}
        </p>
      </Show>
    }>
      <p class="max-w-[19rem] rounded-xl bg-seal-soft/60 px-4 py-2 text-sm leading-snug text-ink">{props.mixUp}</p>
    </Show>
    <Show when={scheduleNote(props.feedback, props.audioCue)}>{(note) => <p class="text-sm text-ink-soft">{note()}</p>}</Show>
  </div>
);
