import { Component, createEffect, createSignal, onCleanup, Show } from 'solid-js';
import { HSKCharacter } from '../types';
import { spokenMeaning } from '../utils/meaning';
import { canSpeak, currentVoiceLabel, speak } from '../utils/speech';
import Icon from './Icon';
import Pinyin from './Pinyin';
import RiceGrid from './RiceGrid';


interface CardProps {
  character: HSKCharacter;
  /** Reveals reading and meaning under the character. */
  flipped?: boolean;
  /** Small label in the top corner. */
  label?: string;
  reserveLabelSpace?: boolean;
  /** Shown under the character until the card is revealed. */
  prompt?: string;
  /** Teach a new character: the grid stays, the glyph waits. */
  concealCharacter?: boolean;
  /** The study screen is the page, so the card drops its frame and fills the column. */
  fill?: boolean;
  /** Named listen control. Explore keeps its own, so the card stays quiet there. */
  hear?: boolean;
  /** Memory step: the Spanish is the question and the glyph stays a question mark. */
  recall?: boolean;
  /** Shown once, on the step that schedules tomorrow's review. */
  coda?: string;
}

const Card: Component<CardProps> = (props) => {
  const [answerMounted, setAnswerMounted] = createSignal(!!props.flipped);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  createEffect(() => {
    if (hideTimer) clearTimeout(hideTimer);
    if (props.flipped) setAnswerMounted(true);
    else if (answerMounted()) hideTimer = setTimeout(() => setAnswerMounted(false), 450);
  });
  onCleanup(() => clearTimeout(hideTimer));
  const hasTraditional = () =>
    !!props.character.traditional && props.character.traditional !== props.character.character;

  const meaning = () => spokenMeaning(props.character);

  return (
    <div
      class="relative sheet flex flex-col overflow-hidden px-5 py-3"
      classList={{
        'h-full min-h-0 w-full flex-1': props.fill,
        'w-full max-w-[24rem]': !props.fill,
      }}
      data-revealed={props.flipped ? 'true' : 'false'}
    >
      <Show when={props.label || props.reserveLabelSpace}>
        <div class="flex h-6 items-center justify-center">
          <span class="truncate text-sm text-ink-soft">{props.label}</span>
        </div>
      </Show>

      <Show when={props.concealCharacter}>
        <p class="w-full shrink-0 px-2 pb-1 text-center font-display text-[1.75rem] font-semibold leading-tight text-ink first-letter:uppercase">
          {meaning()}
        </p>
      </Show>

      {/* Largest square that fits the card, inside the padding. */}
      <div class="card-glyph flex min-h-0 w-full flex-1 items-center justify-center [container-type:size]" classList={{ 'card-glyph-prompt': !props.flipped }}>
        <div class="relative aspect-square max-w-full" style={{ width: "min(100cqw, 100cqh)" }}>
          <RiceGrid class="absolute inset-0 w-full h-full" frame={false} />
          <div
            class="absolute inset-0 flex items-center justify-center font-hanzi leading-none text-ink"
            lang="zh-CN"
          >
            <svg
              viewBox="0 0 100 100"
              class="w-full h-full"
              role="img"
              aria-label={props.concealCharacter ? undefined : props.character.character}
            >
              <Show when={!props.concealCharacter}>
                <text
                  x="50"
                  y="52"
                  text-anchor="middle"
                  dominant-baseline="central"
                  font-size="90"
                  font-weight="400"
                  fill="currentColor"
                  font-family='"WenKai HSK", "Kaiti SC", STKaiti, KaiTi, serif'
                >
                  {props.character.character}
                </text>
              </Show>
            </svg>
          </div>
          <Show when={props.concealCharacter}>
            <span class="pointer-events-none absolute inset-0 flex items-center justify-center font-sans text-[42cqmin] leading-none text-ink/25">
              ?
            </span>
          </Show>
        </div>
      </div>

      <Show when={!props.flipped}>
        <div class="pointer-events-none absolute inset-x-5 bottom-5 text-center text-lg text-ink text-balance">
          {props.prompt ?? 'Toca para ver'}
        </div>
      </Show>
      <div class="card-answer shrink-0" classList={{ 'card-answer-open': !!props.flipped }} aria-hidden={!props.flipped}>
        <div class="min-h-0 overflow-hidden">
        <Show when={answerMounted()}>
        <div class="card-answer-content mt-2 flex flex-col items-center text-center">
          <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <p class="flex h-8 items-center leading-none">
              <Pinyin text={props.character.pinyin} class="text-[1.75rem] font-medium" />
            </p>
            <Show when={!props.concealCharacter && hasTraditional()}>
              <p class="flex items-center gap-1.5 border-l border-line pl-4 text-xs text-ink-soft">
                <span>Tradicional</span>
                <span class="font-hanzi text-xl leading-none text-ink" lang="zh-CN">{props.character.traditional}</span>
              </p>
            </Show>
          </div>
          <Show when={!props.concealCharacter}>
            <p class="mt-1 max-w-full text-[1.35rem] font-medium leading-snug text-ink first-letter:uppercase">
              {meaning()}
            </p>
          </Show>
          <Show when={!props.concealCharacter && props.character.example}>
            {(ex) => (
              <div class="mt-3 w-full max-w-[19rem] rounded-xl bg-paper/60 px-4 py-2 text-left">
                <p class="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-ink-soft">Ejemplo de uso</p>
                <p class="mt-1 flex flex-wrap items-baseline gap-x-2 text-[1.35rem] leading-snug text-ink">
                  <span class="font-hanzi text-[1.65rem] leading-none" lang="zh-CN">
                    {ex().word}
                  </span>
                  <Pinyin text={ex().pinyin} class="text-[1.05rem] font-medium whitespace-nowrap" />
                </p>
                <Show when={ex().es}>
                  <p class="mt-1 text-[0.9375rem] text-ink-soft">{ex().es}</p>
                </Show>
              </div>
            )}
          </Show>
          <Show when={props.hear && canSpeak() && !props.recall}>
            <button
              type="button"
              class="btn-quiet mt-3 h-11 px-4 text-sm"
              onClick={(e) => {
                e.stopPropagation();
                speak(props.character.pinyin, props.character.character);
              }}
              aria-label={`Escuchar, voz ${currentVoiceLabel()}`}
              tabIndex={props.flipped ? undefined : -1}
            >
              <Icon name="sound" size={16} />
              {currentVoiceLabel()}
            </button>
          </Show>
          <Show when={props.coda}>
            <p class="mt-3 text-sm font-medium text-ink">{props.coda}</p>
          </Show>
        </div>
        </Show>
        </div>
      </div>
    </div>
  );
};

export default Card;
