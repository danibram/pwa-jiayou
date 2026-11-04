import { Component, For, Show, createMemo } from 'solid-js';
import { allWords, findWord, type VocabularyEntry } from '../data/vocabulary';
import { relationGroups } from '../data/wordRelations';
import Icon from './Icon';
import Pinyin from './Pinyin';

interface Props {
  word: VocabularyEntry;
  onOpenWord: (id: string) => void;
}

/** Curated synonym / antonym / related / classifier / confused links on a word detail. */
const WordRelations: Component<Props> = (props) => {
  const groups = createMemo(() => relationGroups(props.word, findWord, allWords()));

  return (
    <Show when={groups().length > 0}>
      <section class="mt-6 border-t border-line pt-5 text-left" aria-label="Palabras relacionadas">
        <For each={groups()}>{(group) => (
          <div class="mb-4 last:mb-0">
            <h3 class="eyebrow">{group.label}</h3>
            <ul class="mt-1 divide-y divide-line/70">
              <For each={group.words}>{(other) => (
                <li>
                  <button
                    type="button"
                    class="flex min-h-12 w-full items-center gap-3 py-2 text-left"
                    onClick={() => props.onOpenWord(other.id)}
                  >
                    <span lang="zh-CN" class="w-20 shrink-0 font-hanzi text-xl">{other.simplified}</span>
                    <span class="min-w-0 flex-1">
                      <Pinyin word text={other.pinyin} class="block text-sm" />
                      <span class="block truncate text-xs text-ink-soft first-letter:uppercase">{other.meaning.split(';')[0]}</span>
                    </span>
                    <Show when={other.level}>
                      <span class="shrink-0 text-xs tabular-nums text-ink-faint">HSK {other.level}</span>
                    </Show>
                    <Show when={!other.level}>
                      <span class="shrink-0 text-xs text-ink-faint">Extra</span>
                    </Show>
                    <Icon name="next" size={14} class="shrink-0 text-ink-faint" />
                  </button>
                </li>
              )}</For>
            </ul>
          </div>
        )}</For>
      </section>
    </Show>
  );
};

export default WordRelations;
