import { fold, senseKeys } from './ambiguity';
import type { WordEntry } from './types';

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const plain = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f\s]/g, '').toLowerCase();

/**
 * The gloss as a card shows it, capitalised. Same rule as `displayGloss` in VocabularyReview: when
 * the first sense only repeats the pinyin ("de" under "de"), its note says more and replaces it.
 */
export const displayGloss = (word: Pick<WordEntry, 'senses' | 'pinyin'>): string => {
  const [first] = word.senses;
  const lead = first?.text ?? '';
  const text = first?.note && plain(lead) === plain(word.pinyin) ? first.note : lead;
  return capitalize(text.trim());
};

const characterCount = (word: WordEntry) => [...word.simplified.trim()].length;
const lengthHint = (count: number) => (count === 1 ? 'Un carácter' : `${count} caracteres`);

export interface AskedGloss {
  /** The Spanish the card asks from. */
  text: string;
  /** The length, when no second sense tells the word apart. It does not reveal the answer. */
  hint: string | null;
  /** Another word still fits the text and the hint, so a free answer cannot name one word. */
  ambiguous: boolean;
}

/**
 * The Spanish a production card asks from, as `askGloss` in sessionDeck builds it. When another
 * word shares the first sense ("leer" is 读 and 阅读), the second sense comes along, or the length
 * when there is none. Unlike `askGloss` it checks every word in `vocabulary`, and it reports when
 * the result still fits another word.
 */
export const askGloss = (word: WordEntry, vocabulary: readonly WordEntry[]): AskedGloss => {
  const [first = '', second] = word.senses.map((sense) => sense.text.trim());
  const firstKey = fold(first);
  const rivals = vocabulary.filter(
    (other) => other.simplified.trim() !== word.simplified.trim() && senseKeys(other).has(firstKey),
  );
  if (rivals.length === 0) return { text: first, hint: null, ambiguous: false };
  if (second) {
    const secondKey = fold(second);
    const ambiguous = rivals.some((other) => senseKeys(other).has(secondKey));
    return { text: `${first}, ${second}`, hint: null, ambiguous };
  }
  const count = characterCount(word);
  return { text: first, hint: lengthHint(count), ambiguous: rivals.some((other) => characterCount(other) === count) };
};

