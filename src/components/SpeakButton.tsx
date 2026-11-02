import { Component, onCleanup } from 'solid-js';
import { canSpeak, isSpeaking, speak, speakWord, speaking, speechKey, stopSpeech } from '../utils/speech';

interface SpeakButtonProps {
  pinyin: string;
  hanzi?: string;
  /** A whole word: plays syllable by syllable with citation-tone fallback. */
  word?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** Accessible name. */
  label?: string;
  class?: string;
  /** Called when no clip and no browser voice can play it. */
  onUnavailable?: () => void;
}

const BOX = { sm: 'h-11 w-11', md: 'h-12 w-12', lg: 'h-14 w-14' } as const;
const GLYPH = { sm: 18, md: 20, lg: 24 } as const;

/** Icon-only listen button. The waves move while its own clip plays. */
const SpeakButton: Component<SpeakButtonProps> = (props) => {
  const playing = () => isSpeaking(props.pinyin, props.hanzi);
  const size = () => props.size ?? 'sm';

  // The key this button last started. Cleanup must not read props: a parent <Show> may already be gone.
  let started: string | null = null;

  const toggle = () => {
    if (playing()) {
      stopSpeech();
      return;
    }
    started = speechKey(props.pinyin, props.hanzi);
    if (props.word && props.hanzi) speakWord(props.pinyin, props.hanzi, props.onUnavailable);
    else speak(props.pinyin, props.hanzi);
  };

  // Leaving the screen should not leave a clip talking over the next one.
  onCleanup(() => {
    if (started !== null && speaking() === started) stopSpeech();
  });

  return (
    <button
      type="button"
      class={`btn-quiet relative shrink-0 shadow-none ${BOX[size()]} ${props.class ?? ''}`}
      classList={{ 'border-ink text-ink ring-2 ring-ink/15': playing() }}
      aria-label={props.label ?? 'Escuchar'}
      aria-pressed={playing()}
      disabled={!canSpeak()}
      onClick={toggle}
    >
      <svg
        width={GLYPH[size()]}
        height={GLYPH[size()]}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M11 5L6 9H3v6h3l5 4V5z" fill="currentColor" fill-opacity={playing() ? 0.9 : 0} />
        <path
          d="M15.5 8.5a5 5 0 0 1 0 7"
          classList={{ 'animate-pulse': playing() }}
        />
        <path
          d="M18.5 5.5a9 9 0 0 1 0 13"
          classList={{ 'animate-pulse': playing() }}
          style={{ 'animation-delay': '300ms' }}
        />
      </svg>
    </button>
  );
};

export default SpeakButton;
