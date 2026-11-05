import { Component, For, Show, createMemo } from 'solid-js';
import type { VocabularyEntry } from '../data/vocabulary';
import { vocabularyStore } from '../stores/vocabularyStore';
import { relationGroups, type WordRelationKind } from '@jiayou/content';
import { leadSense } from '@jiayou/content';
import Pinyin from './Pinyin';
import WordRef from './WordRef';

interface Props {
  word: VocabularyEntry;
  onOpenWord: (id: string) => void;
}

/** 'confused' joins Suena parecido; the rest are meaning links and live here. */
const KINDS: WordRelationKind[] = ['synonym', 'antonym', 'classifier', 'related'];
const LABEL: Record<string, string> = { synonym: 'Sinónimos', antonym: 'Antónimos', classifier: 'Se cuenta con', related: 'Relacionadas' };
const SIGN: Record<string, string> = { synonym: '≈' };

const short = (word: VocabularyEntry) => leadSense(word.senses);

/** Curated synonym, antonym, classifier and related links, each drawn the way it reads. */
const WordRelations: Component<Props> = (props) => {
  const groups = createMemo(() =>
    relationGroups(props.word, (id) => vocabularyStore.findSelectedWord(id), vocabularyStore.getSelectedWords()).filter((group) => KINDS.includes(group.kind))
      .sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind)));

  const open = (word: VocabularyEntry) => () => props.onOpenWord(word.id);

  return (
    <Show when={groups().length > 0}>
      <section class="mt-6 border-t border-line pt-5 text-left" aria-label="Palabras cercanas">
        <h3 class="eyebrow">Palabras cercanas</h3>
        <For each={groups()}>{(group) => (
          <div class="mt-3" role="group" aria-label={LABEL[group.kind]}>
            <p class="text-xs font-medium text-ink-soft">{LABEL[group.kind]}</p>
            <Show when={group.kind === 'antonym'}>
              {/* An antonym reads as a pair: this word on the left, its opposite on the right. */}
              <ul class="mt-1.5 space-y-2">
                <For each={group.words}>{(other) => (
                  <li>
                    <button type="button" class="tile grid w-full grid-cols-[1fr_auto_1fr] items-center px-3 py-2.5 text-center transition-transform active:scale-[0.98]" onClick={open(other)} aria-label={`${props.word.simplified} es lo contrario de ${other.simplified}, ${other.pinyin}, ${short(other)}`}>
                      <span class="min-w-0">
                        <span lang="zh-CN" class="block font-hanzi text-2xl leading-tight text-ink-faint">{props.word.simplified}</span>
                        <Pinyin word text={props.word.pinyin} class="block text-xs opacity-50" />
                      </span>
                      <span class="px-3 text-lg text-ink-faint" aria-hidden="true">↔</span>
                      <span class="min-w-0">
                        <span lang="zh-CN" class="block font-hanzi text-2xl leading-tight">{other.simplified}</span>
                        <Pinyin word text={other.pinyin} class="block text-xs" />
                        <span class="block truncate text-xs text-ink-soft first-letter:uppercase">{short(other)}</span>
                      </span>
                    </button>
                  </li>
                )}</For>
              </ul>
            </Show>
            <Show when={group.kind === 'classifier'}>
              {/* A classifier reads as the phrase a learner says: 一 本 书. */}
              <ul class="mt-1.5 space-y-2">
                <For each={group.words}>{(other) => (
                  <li>
                    <button type="button" class="tile flex w-full items-center gap-4 px-4 py-2.5 text-left transition-transform active:scale-[0.98]" onClick={open(other)} aria-label={`Se cuenta con ${other.simplified}, ${other.pinyin}: 一${other.simplified}${props.word.simplified}`}>
                      <span lang="zh-CN" class="font-hanzi text-2xl leading-none tracking-wide" aria-hidden="true">
                        <span class="text-ink-faint">一</span><span class="text-ink">{other.simplified}</span><span class="text-ink-faint">{props.word.simplified}</span>
                      </span>
                      <span class="min-w-0 flex-1">
                        <Pinyin word text={other.pinyin} class="block text-sm" />
                        <span class="block truncate text-xs text-ink-soft first-letter:uppercase">{short(other)}</span>
                      </span>
                    </button>
                  </li>
                )}</For>
              </ul>
            </Show>
            <Show when={group.kind === 'synonym' || group.kind === 'related'}>
              <ul class="mt-1.5 grid grid-cols-2 gap-2">
                <For each={group.words}>{(other) => (
                  <li classList={{ 'col-span-2': group.words.length === 1 }}>
                    <WordRef hanzi={other.simplified} pinyin={other.pinyin} gloss={short(other)} sign={SIGN[group.kind]} row={group.words.length === 1} onOpen={open(other)} />
                  </li>
                )}</For>
              </ul>
            </Show>
          </div>
        )}</For>
      </section>
    </Show>
  );
};

export default WordRelations;
