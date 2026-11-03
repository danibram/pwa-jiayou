import { Component, createMemo, For, Show } from 'solid-js';
import { allWords } from '../stores/myWordsStore';
import { characterForHit, searchCharacters } from '../utils/characterSearch';
import { foldPinyin, markTones, toneOf } from '../utils/pinyin';
import Pinyin from './Pinyin';
import SpeakButton from './SpeakButton';
import Icon from './Icon';

interface Props {
  character: string;
  pinyin: string;
  onOpenWord?: (id: string) => void;
  onOpenCharacter?: (character: string) => void;
}

const reading = (value: string) => {
  const marked = markTones(value.trim());
  if (!/^[a-züêāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńňǹ]+$/i.test(marked)) return undefined;
  return { base: foldPinyin(marked), tone: toneOf(marked) };
};

const ToneNeighbors: Component<Props> = (props) => {
  const matches = createMemo(() => {
    const current = reading(props.pinyin);
    if (!current) return [];
    const seen = new Set<string>();
    const result: { character: string; pinyin: string; meaning: string; wordId?: string; level?: number }[] = [];
    const add = (character: string, pinyin: string, meaning: string, level?: number, wordId?: string) => {
      const candidate = reading(pinyin);
      if (!candidate || character === props.character || candidate.base !== current.base || candidate.tone === current.tone) return;
      const key = `${character}:${candidate.base}:${candidate.tone}`;
      if (seen.has(key)) return;
      seen.add(key);
      result.push({ character, pinyin, meaning, level, wordId });
    };
    for (const word of allWords()) {
      if ([...word.simplified].length === 1) add(word.simplified, word.pinyin, word.meaning, word.level, word.id);
    }
    for (const hit of searchCharacters('', [])) {
      const char = characterForHit(hit, []);
      for (const pinyin of char.pinyin.split(/[\s,;/]+/)) add(char.character, pinyin, char.gloss ?? char.definition, char.hsk_level);
    }
    return result.sort((a, b) => (a.level ?? 7) - (b.level ?? 7) || toneOf(a.pinyin) - toneOf(b.pinyin));
  });

  return (
    <Show when={matches().length > 0}>
      <section class="mt-5 border-t border-line pt-4" aria-label="Misma sílaba, otros tonos">
        <h3 class="eyebrow">Misma sílaba, otros tonos</h3>
        <p class="mt-1 text-xs text-ink-soft">Compara cómo cambia el significado con el tono.</p>
        <ul class="mt-1 divide-y divide-line/70">
          <For each={matches()}>{(item) => (
            <li class="flex items-center gap-1">
              <button type="button" class="flex min-h-11 min-w-0 flex-1 items-center gap-3 py-2 text-left" onClick={() => item.wordId && props.onOpenWord ? props.onOpenWord(item.wordId) : props.onOpenCharacter?.(item.character)} disabled={item.wordId ? !props.onOpenWord && !props.onOpenCharacter : !props.onOpenCharacter}>
                <span class="w-8 shrink-0 font-hanzi text-xl" lang="zh-CN">{item.character}</span>
                <span class="min-w-0 flex-1"><Pinyin text={item.pinyin} class="block text-sm" /><span class="block truncate text-xs text-ink-soft first-letter:uppercase">{item.meaning.split(';')[0]}</span></span>
                <Show when={item.level}><span class="text-xs text-ink-faint">HSK {item.level}</span></Show>
                <Icon name="next" size={14} class="shrink-0 text-ink-faint" />
              </button>
              <SpeakButton pinyin={item.pinyin} hanzi={item.character} />
            </li>
          )}</For>
        </ul>
      </section>
    </Show>
  );
};

export default ToneNeighbors;
