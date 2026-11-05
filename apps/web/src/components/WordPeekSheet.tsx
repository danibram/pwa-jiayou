import { Component, For, JSX, Show } from 'solid-js';
import Drawer from './Drawer';
import Pinyin from './Pinyin';
import RiceGrid from './RiceGrid';
import SpeakButton from './SpeakButton';
import type { VocabularyEntry } from '../data/vocabulary';
import { canSpeak } from '../utils/speech';
import { leadSense } from '@jiayou/content';

interface Props {
  word: VocabularyEntry;
  onCharacter: (char: string) => void;
  onClose: () => void;
  onBack?: () => void;
  /** One line about the word in this session, such as its misses, under the reading. */
  note?: string;
  /** The same word sheet the session shows under an answer. */
  children: JSX.Element;
}

/**
 * A quick look at a word over a session or its summary: characters, reading, every use, a sentence
 * and its close words. Each character and word opens in its place, so the session never moves.
 */
const WordPeekSheet: Component<Props> = (props) => (
  <Drawer
    aria-labelledby="word-peek-title"
    class="px-4"
    style={{ 'padding-bottom': 'max(env(safe-area-inset-bottom), 1.25rem)' }}
    onClose={() => props.onClose()}
    onBack={props.onBack}
  >
    <div class="mt-2 flex items-center justify-center gap-1" lang="zh-CN" role="group" aria-label={props.word.simplified}>
      <For each={props.word.characters}>{(char) => (
        <button
          type="button"
          class="relative aspect-square w-[min(5rem,22vw)] rounded-tile transition-transform active:scale-[0.97]"
          aria-label={`Ver el carácter ${char}`}
          onClick={() => props.onCharacter(char)}
        >
          <RiceGrid class="absolute inset-0 h-full w-full" frame={false} />
          <span class="relative font-hanzi text-[min(3.5rem,15vw)] leading-none">{char}</span>
        </button>
      )}</For>
    </div>
    <div class="mt-2 flex items-center justify-center gap-3">
      <Pinyin word text={props.word.pinyin} class="text-xl font-medium" />
      <Show when={canSpeak()}>
        <SpeakButton word size="sm" pinyin={props.word.pinyin} hanzi={props.word.simplified} />
      </Show>
    </div>
    <p class="mt-1 text-center text-2xl font-semibold leading-snug first-letter:uppercase">{leadSense(props.word.senses)}</p>
    <p class="mt-1 text-center text-xs text-ink-faint">
      {props.word.level ? `HSK ${props.word.level}` : 'Extra'}
      <Show when={props.word.traditional !== props.word.simplified}> · Tradicional <span lang="zh-TW" class="font-hanzi text-sm text-ink-soft">{props.word.traditional}</span></Show>
    </p>
    <Show when={props.note}><p class="mt-2 text-center text-sm text-ink-soft">{props.note}</p></Show>
    <h2 id="word-peek-title" class="sr-only">{props.word.simplified}</h2>
    <div class="mt-4">{props.children}</div>
  </Drawer>
);

export default WordPeekSheet;
