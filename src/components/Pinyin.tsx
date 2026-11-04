import { Component, For, createMemo } from 'solid-js';
import { pinyinSyllableHighlights } from '../utils/pinyinHighlights';
import { endsInParticle, groupPinyin } from '../utils/pinyin';
import { extraVocabulary, vocabulary } from '../data/vocabulary';

/** Spellings of the multi-syllable words in `entries`, as space-joined lowercase pinyin. */
const spellings = (entries: readonly { simplified: string; pinyin: string }[]) =>
  entries
    // A word written with a trailing 的/吗/呢 (似的) reads the same as a phrase (是的), which stays apart.
    .filter((entry) => !/[的吗呢]$/.test(entry.simplified))
    .map((entry) => entry.pinyin.trim().toLowerCase().replace(/\s+/g, ' '))
    .filter((pinyin) => pinyin.includes(' '));

let words: Set<string> | null = null;

/** A run of syllables is one word when the HSK or Extra lists have a word spelled that way. */
const isWord = (syllables: string[]) => {
  words ??= new Set(spellings([...vocabulary, ...extraVocabulary]));
  const spelled = syllables.join(' ').toLowerCase();
  return words.has(spelled);
};

const TONE_CLASS = {
  1: 'text-tone-1',
  2: 'text-tone-2',
  3: 'text-tone-3',
  4: 'text-tone-4',
  5: 'text-tone-5',
} as const;

/** Pinyin coloured by tone, the convention Pleco and most dictionaries use. */
const Pinyin: Component<{
  text: string;
  class?: string;
  plain?: boolean;
  highlightQuery?: string;
  /** The text is one word (an example word, a list entry), so its syllables are written together. */
  word?: boolean;
}> = (props) => {
  const segments = createMemo(() => {
    const parts = groupPinyin(props.text, props.word ? (syllables) => isWord(syllables) || !endsInParticle(syllables) : isWord);
    const flags = pinyinSyllableHighlights(props.text, props.highlightQuery ?? '');
    const active = !!props.highlightQuery?.trim();
    let syllable = 0;
    return parts.map((part) => {
      const highlight = active && part.tone !== null && (flags[syllable++] ?? false);
      return { part, highlight };
    });
  });

  return (
    <span class={`font-sans ${props.class ?? ''}`} lang="zh-Latn-pinyin">
      <For each={segments()}>
        {({ part, highlight }) => {
          const colored = () => !!part.tone && !props.plain;
          const mark = () => (highlight ? 'rounded-sm bg-jade/20 ring-1 ring-jade/35' : '');
          return part.tone ? (
            <span class={`${colored() ? TONE_CLASS[part.tone] : 'text-ink'} ${mark()}`}>{part.text}</span>
          ) : (
            <span class="text-ink-faint">{part.text}</span>
          );
        }}
      </For>
    </span>
  );
};

export default Pinyin;
