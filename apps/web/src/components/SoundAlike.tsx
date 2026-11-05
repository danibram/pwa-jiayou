import { Component, For, Show } from 'solid-js';
import Pinyin from './Pinyin';
import type { SoundMatch } from '@jiayou/chinese';

export interface SoundAlikeItem {
  key: string;
  hanzi: string;
  pinyin: string;
  gloss: string;
  /** 'confused' is an editor link: the pair gets mixed up even if it does not sound alike. */
  match: SoundMatch | 'confused';
  level?: number;
  onOpen?: () => void;
}

interface Props {
  items: SoundAlikeItem[];
  /** Says what is compared: words or single characters. */
  hint: string;
  /** Word tiles need room for two or three hanzi. */
  wide?: boolean;
}

const GROUPS: { match: SoundAlikeItem['match']; label: string }[] = [
  { match: 'confused', label: 'Fácil de confundir' },
  { match: 'same', label: 'Suena igual' },
  { match: 'tone', label: 'Otro tono' },
];

/** Small comparison tiles, one shape at any count, so they never look like the word family. */
const SoundAlike: Component<Props> = (props) => (
  <Show when={props.items.length > 0}>
    <section class="mt-6 border-t border-line pt-5 text-left" aria-label="Suena parecido">
      <h3 class="eyebrow">Suena parecido</h3>
      <p class="mt-1 text-xs text-ink-soft">{props.hint}</p>
      <For each={GROUPS.filter((group) => props.items.some((item) => item.match === group.match))}>{(group) => (
        <div class="mt-3">
          <p class="text-xs font-medium" classList={{ 'text-seal': group.match === 'confused', 'text-ink-soft': group.match !== 'confused' }}>{group.label}</p>

          <ul class={`mt-1.5 grid gap-2 ${props.wide ? 'grid-cols-3' : 'grid-cols-3 min-[360px]:grid-cols-4'}`}>
            <For each={props.items.filter((item) => item.match === group.match)}>{(item) => (
              <li>
                <button
                  type="button"
                  class="tile flex h-full w-full flex-col items-center px-1.5 pb-2 pt-2.5 text-center transition-transform active:scale-[0.97] disabled:opacity-100"
                  classList={{ 'border-seal/40': item.match === 'confused' }}
                  disabled={!item.onOpen}
                  aria-label={`${item.hanzi}, ${item.pinyin}, ${item.gloss}${item.level ? `, HSK ${item.level}` : ''}`}
                  onClick={() => item.onOpen?.()}
                >
                  <span lang="zh-CN" class="font-hanzi text-2xl leading-none">{item.hanzi}</span>
                  <Pinyin word text={item.pinyin} class="mt-1.5 text-sm leading-none" />
                  <span class="mt-1 line-clamp-2 w-full text-[0.6875rem] leading-tight text-ink-soft first-letter:uppercase">{item.gloss.replace(/\s*\([^)]*\)\s*/g, ' ').trim() || item.gloss}</span>
                </button>
              </li>
            )}</For>
          </ul>
        </div>
      )}</For>
    </section>
  </Show>
);

export default SoundAlike;
