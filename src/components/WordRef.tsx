import { Component, For, Show } from 'solid-js';
import Pinyin from './Pinyin';

interface Props {
  hanzi: string;
  pinyin: string;
  gloss: string;
  /** A one-item group gets the full row instead of a lonely tile. */
  row?: boolean;
  /** Characters to keep in full ink; the rest fade. Shows which character a family shares. */
  focus?: string;
  /** Short sign before the hanzi, such as ≈ for a synonym. */
  sign?: string;
  /** Editor "easy to confuse" link: seal border. */
  warn?: boolean;
  label?: string;
  onOpen?: () => void;
}

/** The one way the word page shows another word: hanzi, pinyin, a short gloss. */
const WordRef: Component<Props> = (props) => {
  const gloss = () => props.gloss.replace(/\s*\([^)]*\)\s*/g, ' ').trim() || props.gloss;
  return (
    <button
      type="button"
      class="tile flex h-full w-full min-w-0 px-3 py-2.5 text-left transition-transform active:scale-[0.98] disabled:opacity-100"
      classList={{ 'items-center gap-3': props.row, 'flex-col': !props.row, 'border-seal/40': props.warn }}
      disabled={!props.onOpen}
      aria-label={props.label ?? `${props.hanzi}, ${props.pinyin}, ${gloss()}`}
      onClick={() => props.onOpen?.()}
    >
      <span class="flex shrink-0 items-baseline gap-1.5">
        <Show when={props.sign}><span class="text-base text-ink-faint" aria-hidden="true">{props.sign}</span></Show>
        <span lang="zh-CN" class="font-hanzi text-xl leading-tight">
          <Show when={props.focus} fallback={props.hanzi}>
            <For each={[...props.hanzi]}>{(c) => <span classList={{ 'text-ink-faint': !props.focus!.includes(c) }}>{c}</span>}</For>
          </Show>
        </span>
      </span>
      <span class="min-w-0" classList={{ 'flex-1': props.row }}>
        <Pinyin word text={props.pinyin} class="block text-xs" />
        <span class="block truncate text-xs text-ink-soft first-letter:uppercase">{gloss()}</span>
      </span>
    </button>
  );
};

export default WordRef;
