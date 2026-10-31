import { Component, For } from 'solid-js';
import { splitPinyin } from '../utils/pinyin';

const TONE_CLASS = {
  1: 'text-tone-1',
  2: 'text-tone-2',
  3: 'text-tone-3',
  4: 'text-tone-4',
  5: 'text-tone-5',
} as const;

/** Pinyin coloured by tone, the convention Pleco and most dictionaries use. */
const Pinyin: Component<{ text: string; class?: string; plain?: boolean }> = (props) => {
  return (
    <span class={`font-sans ${props.class ?? ''}`} lang="zh-Latn-pinyin">
      <For each={splitPinyin(props.text)}>
        {(part) => {
          const colored = () => !!part.tone && !props.plain;
          return part.tone ? (
            <span class={colored() ? TONE_CLASS[part.tone] : 'text-ink'}>
              {part.text}
            </span>
          ) : (
            <span class="text-ink-faint">{part.text}</span>
          );
        }}
      </For>
    </span>
  );
};

export default Pinyin;
