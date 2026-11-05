import { Component, For, Show } from 'solid-js';
import { vocabularyExamples, type VocabularyEntry } from '../data/vocabulary';
import { markWord } from '../utils/wordDetail';
import Pinyin from './Pinyin';

interface Props {
  word: VocabularyEntry;
  /** Opens a character of a sentence, so a learner can look up the rest of it. */
  onCharacter: (char: string) => void;
  class?: string;
}

/** The word in its sentences, marked, each character tappable, with the reading and the Spanish under it. */
const WordExample: Component<Props> = (props) => {
  const sentences = () => vocabularyExamples(props.word);
  return (
    <Show when={sentences().length > 0}>
      <section class={`text-left ${props.class ?? ''}`} aria-label={sentences().length > 1 ? 'En frases' : 'En una frase'}>
        <h3 class="eyebrow">{sentences().length > 1 ? 'En frases' : 'En una frase'}</h3>
        <For each={sentences()}>{(example) => (
          <figure class="mt-2 border-l-2 border-line pl-4 [&+figure]:mt-4">
            <p class="font-hanzi text-[1.375rem] leading-relaxed" lang="zh-CN">
              <For each={markWord(example.chinese, props.word.simplified)}>{(part) => {
                // Buttons are inline-block, so the mark is drawn on each one: an underline would not reach them.
                const chars = (
                  <For each={[...part.text]}>{(c) => (
                    <Show when={/\p{Script=Han}/u.test(c)} fallback={c}>
                      <button type="button" class="active:bg-ink/10" classList={{ 'border-b-2 border-ink/60': part.hit }} aria-label={`${c} en la frase`} onClick={() => props.onCharacter(c)}>{c}</button>
                    </Show>
                  )}</For>
                );
                return (
                  <Show when={part.hit} fallback={<span class="text-ink-soft">{chars}</span>}>
                    <mark class="bg-transparent text-ink">{chars}</mark>
                  </Show>
                );
              }}</For>
            </p>
            <Show when={example.pinyin}>{(reading) => <Pinyin text={reading()} class="mt-0.5 block text-sm" />}</Show>
            <figcaption class="mt-1 text-sm text-ink-soft">{example.spanish}</figcaption>
          </figure>
        )}</For>
      </section>
    </Show>
  );
};

export default WordExample;
