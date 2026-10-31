import { Component, Show } from 'solid-js';
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

/**
 * The character never moves: revealing slides the reading in underneath, so the
 * eye stays on the shape being learned.
 */
const Card: Component<CardProps> = (props) => {
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
      <div class="flex min-h-0 w-full flex-1 items-center justify-center [container-type:size]">
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

      {/* Reading and meaning. They sit together under the grid, not stretched to the button. */}
      <div class="flex min-h-[11rem] shrink-0 flex-col">
        <Show when={!props.flipped}>
          <div class="flex items-center justify-center px-3 py-4">
            <span class="text-center text-lg text-ink text-balance">{props.prompt ?? 'Toca para ver'}</span>
          </div>
        </Show>
        <Show when={props.flipped}>
        <div class="animate-reveal mt-2 flex flex-col items-center text-center">
          <p class="flex h-8 items-center leading-none">
            <Pinyin text={props.character.pinyin} class="text-[1.75rem] font-medium" />
          </p>
          <Show when={!props.concealCharacter}>
            <p class="mt-1 max-w-full text-[1.35rem] font-medium leading-snug text-ink first-letter:uppercase">
              {meaning()}
            </p>
          </Show>
          <Show when={!props.concealCharacter && props.character.example}>
            {(ex) => (
              <div class="mt-3 w-full max-w-[19rem] border-t border-line/70 pt-2">
                <p class="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-ink-soft">Ejemplo</p>
                <p class="mt-1 flex flex-wrap items-baseline justify-center gap-x-2 text-[1.35rem] leading-snug text-ink">
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
            >
              <Icon name="sound" size={16} />
              {currentVoiceLabel()}
            </button>
          </Show>
          <Show when={!props.concealCharacter && hasTraditional()}>
            <p class="mt-1 text-sm text-ink-soft">
              tradicional{' '}
              <span class="font-hanzi text-lg text-ink">{props.character.traditional}</span>
            </p>
          </Show>
          <Show when={props.coda}>
            <p class="mt-3 text-sm font-medium text-ink">{props.coda}</p>
          </Show>
        </div>
        </Show>
      </div>
    </div>
  );
};

export default Card;
