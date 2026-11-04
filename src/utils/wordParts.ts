import { characterStore } from '../stores/characterStore';
import { characterRecord } from './characterSearch';
import { glossHead } from './glossDisplay';
import { mainMeaning } from './meaning';

/**
 * The short meaning of one character inside a word, for "知 saber + 道 camino".
 * Undefined for a character outside HSK, which has no gloss of its own.
 */
export const characterGloss = (char: string): string | undefined => {
  const record = characterRecord(char, characterStore.state.characters);
  if (!record) return undefined;
  const head = glossHead(mainMeaning(record));
  return head || undefined;
};

/** Each character of a multi-character word with its gloss. A one-character word is its own meaning. */
export const wordParts = (characters: readonly string[]): { char: string; gloss?: string }[] =>
  characters.length > 1 ? characters.map((char) => ({ char, gloss: characterGloss(char) })) : [];

/** The curated example word of a character, for a one-character word that has no other word to show it in. */
export const characterExample = (char: string) => characterRecord(char, characterStore.state.characters)?.example;
