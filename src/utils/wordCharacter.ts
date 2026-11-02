import { allWords } from '../stores/myWordsStore';
import type { HSKCharacter } from '../types';
import { characterRecord } from './characterSearch';
import { pinyinParts } from './pinyin';

/** What a character sheet or the stroke page shows. A character outside HSK has no level, radical or deck row. */
export type KnownCharacter = Omit<HSKCharacter, 'hsk_level'> & { hsk_level?: HSKCharacter['hsk_level'] };

/**
 * The record of an HSK character, or a stub built from the first word that uses it: the syllable
 * at its position and a meaning that names that word ("en 咖喱: curry"). Undefined when neither knows it.
 */
export const characterOrWordStub = (char: string, installed: readonly HSKCharacter[]): KnownCharacter | undefined => {
  const record = characterRecord(char, installed);
  if (record) return record;
  const word = allWords().find((entry) => entry.characters.includes(char));
  if (!word) return undefined;
  const index = word.characters.indexOf(char);
  return {
    character: char,
    traditional: [...word.traditional][index] ?? char,
    pinyin: pinyinParts(word.pinyin)[index]?.syllable ?? '',
    definition: '',
    radical: '',
    stroke_count: 0,
    general_standard: 0,
    frequency_rank: 0,
    gloss: `en ${word.simplified}: ${word.meaning.split(';')[0]}`,
  };
};
