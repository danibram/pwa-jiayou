import type { VocabularyEntry } from '../data/vocabulary';
import { resolveWordRelations } from '../data/wordRelations';
import { levelRank } from './wordOrder';
import { bySound, readingOf, soundMatch, type SoundMatch } from '@jiayou/chinese';


/** 一会儿 yíhuìr: a final 儿 read as -r is a spoken suffix, not 儿 "hijo". */
const erhua = (word: VocabularyEntry) =>
  word.simplified.endsWith('儿') && word.characters.length > 1 &&
  /[^e]r$/i.test(word.pinyin.trim().normalize('NFD').replace(/\p{M}/gu, ''));

/**
 * One block per distinct character of the word, with up to `limit` other words that use it.
 * Lower levels and shorter words first, so the family starts with what a learner meets first.
 */
export const familyByChar = (word: VocabularyEntry, all: readonly VocabularyEntry[], limit = 4, exclude: ReadonlySet<string> = new Set()) =>
  [...new Set(word.characters)].map((char) => ({
    char,
    words: all
      .filter((other) => other.id !== word.id && !exclude.has(other.id) && other.simplified !== char && other.characters.includes(char))
      // A shared 儿 that is only the erhua suffix in the other word teaches a false link.
      .filter((other) => !(char === '儿' && erhua(other) && other.characters.lastIndexOf('儿') === other.characters.length - 1))
      .sort((a, b) => levelRank(a) - levelRank(b) || a.characters.length - b.characters.length)
      .slice(0, limit),
  }));

export interface WordSound {
  word: VocabularyEntry;
  match: SoundMatch | 'confused';
  level?: number;
}

/**
 * Catalog words that sound like this one: editor "confused" links first, then the same
 * syllables in the same tones, then in other tones. Words already linked are not repeated.
 */
export const wordSoundAlikes = (
  word: VocabularyEntry,
  all: readonly VocabularyEntry[],
  byId: (id: string) => VocabularyEntry | undefined,
  limit = 9,
): WordSound[] => {
  const shownAbove = new Set((['synonym', 'antonym', 'classifier', 'related'] as const).flatMap((kind) => resolveWordRelations(word, kind, byId, all).map((other) => other.id)));
  const confused = resolveWordRelations(word, 'confused', byId, all).filter((other) => !shownAbove.has(other.id)).map((other): WordSound => ({ word: other, match: 'confused', level: other.level }));
  // A word already shown as synonym, antonym, classifier or related is not repeated here.
  const seen = new Set([word.id, ...shownAbove, ...confused.map((item) => item.word.id)]);
  const reading = readingOf(word.pinyin);
  const alike: WordSound[] = [];
  if (reading) {
    for (const other of all) {
      if (seen.has(other.id) || other.simplified === word.simplified) continue;
      const theirs = readingOf(other.pinyin);
      const match = theirs && soundMatch(reading, theirs);
      if (match) alike.push({ word: other, match, level: other.level });
    }
  }
  return [...confused, ...alike.sort(bySound)].slice(0, limit);
};

/** Ids of every word the relation sections already show, so a word appears once per page. */
export const linkedIds = (word: VocabularyEntry, byId: (id: string) => VocabularyEntry | undefined, all: readonly VocabularyEntry[]): Set<string> =>
  new Set((['synonym', 'antonym', 'classifier', 'related', 'confused'] as const).flatMap((kind) => resolveWordRelations(word, kind, byId, all).map((other) => other.id)));

/** The example sentence cut around each occurrence of the word, so the page can mark it. */
export const markWord = (sentence: string, word: string): { text: string; hit: boolean }[] => {
  if (!word) return [{ text: sentence, hit: false }];
  const parts = sentence.split(word);
  return parts.flatMap((text, i) => [
    ...(text ? [{ text, hit: false }] : []),
    ...(i < parts.length - 1 ? [{ text: word, hit: true }] : []),
  ]);
};
