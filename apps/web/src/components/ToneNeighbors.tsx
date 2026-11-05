import { Component, createMemo } from 'solid-js';
import { vocabularyStore } from '../stores/vocabularyStore';
import { characterForHit, searchCharacters } from '../utils/characterSearch';
import { glossHead } from '@jiayou/chinese';
import { leadSense } from '../data/wordSenses';
import { markTones } from '@jiayou/chinese';
import { bySound, readingOf, soundMatch } from '@jiayou/chinese';
import SoundAlike, { type SoundAlikeItem } from './SoundAlike';

interface Props {
  character: string;
  pinyin: string;
  onOpenWord?: (id: string) => void;
  onOpenCharacter?: (character: string) => void;
}

/** Tiles per group; the common ones come first, so rare HSK 6 homophones fall off and other tones still show. */
const LIMIT = { same: 6, tone: 8 };

/** Single characters with the same syllable as this one, in the character drawer. */
const ToneNeighbors: Component<Props> = (props) => {
  const items = createMemo((): SoundAlikeItem[] => {
    const current = readingOf(markTones(props.pinyin));
    if (!current || current.bases.length !== 1) return [];
    const byKey = new Map<string, SoundAlikeItem>();
    const add = (character: string, pinyin: string, meaning: string, level?: number, wordId?: string) => {
      const reading = readingOf(markTones(pinyin));
      if (character === props.character || !reading) return;
      const match = soundMatch(current, reading);
      if (!match) return;
      const key = `${character}:${reading.tones[0]}`;
      const known = byKey.get(key);
      // The word entry knows how to open the word page; keep it over the bare character.
      if (known && (known.level !== undefined || !wordId)) return;
      const onOpen = wordId && props.onOpenWord
        ? () => props.onOpenWord!(wordId)
        : props.onOpenCharacter ? () => props.onOpenCharacter!(character) : undefined;
      byKey.set(key, { key, hanzi: character, pinyin, gloss: glossHead(meaning), match, level, onOpen });
    };
    // Words of the checked lists, and characters of the levels being studied.
    for (const word of vocabularyStore.getSelectedWords()) {
      if ([...word.simplified].length === 1) add(word.simplified, word.pinyin, leadSense(word.senses), word.level, word.id);
    }
    const levels = vocabularyStore.studiedLevels();
    for (const hit of searchCharacters('', [])) {
      const char = characterForHit(hit, []);
      if (!levels.includes(char.hsk_level)) continue;
      for (const pinyin of char.pinyin.split(/[\s,;/]+/)) add(char.character, pinyin, char.gloss ?? char.definition, char.hsk_level);
    }
    const sorted = [...byKey.values()].sort(bySound);
    return [
      ...sorted.filter((item) => item.match === 'same').slice(0, LIMIT.same),
      ...sorted.filter((item) => item.match === 'tone').slice(0, LIMIT.tone),
    ];
  });

  return <SoundAlike items={items()} hint="Caracteres con la misma sílaba. El tono cambia el significado." />;
};

export default ToneNeighbors;
