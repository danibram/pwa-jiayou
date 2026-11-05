import type { Tone } from '../../../utils/pinyin';

/**
 * Names the rules in this file and in `pinyinAnswer.ts`: how typed pinyin is read, which tones a
 * syllable accepts and when an answer is correct. Every typed-pinyin exercise stores it as its
 * rubric revision. Bump it when the same input and entry would get another evaluation or diagnosis.
 */
export const PINYIN_POLICY_VERSION = 'pinyin-policy@1';

/** One letter of a syllable after normalisation. `ü` and `ê` keep their own letters. */
export interface PinyinLetter {
  letter: string;
  /** The tone mark written on this letter, if any. */
  mark: Tone | null;
}

/**
 * A run of letters between separators or tone digits. It may hold several syllables ("nihao"),
 * which the evaluator splits against the expected reading.
 */
export interface PinyinToken {
  letters: readonly PinyinLetter[];
  /** A tone digit right after the run: 1 to 4, or 5 for both 5 and 0. */
  digit: Tone | null;
}

export type PinyinFormatError =
  | { kind: 'unexpected-character'; character: string; at: number }
  /** A digit with no letters before it ("3ni", "ni33"). */
  | { kind: 'misplaced-digit'; character: string; at: number }
  /** 6 to 9: no tone has that number. */
  | { kind: 'unknown-tone-number'; character: string; at: number }
  /** A tone mark or diaeresis with no letter to sit on, or on a letter that cannot take it. */
  | { kind: 'misplaced-mark'; at: number }
  /** Only separators: nothing that could be a syllable. */
  | { kind: 'no-syllables' }
  /** Two tone marks stacked on one letter. */
  | { kind: 'stacked-marks'; at: number };

export type ParsedPinyin =
  | { kind: 'empty' }
  | { kind: 'tokens'; tokens: readonly PinyinToken[] }
  | { kind: 'format-error'; errors: readonly PinyinFormatError[] };

/** Spaces, apostrophes in their usual shapes and hyphens separate syllables and mean nothing else. */
const SEPARATOR = /[\s'’‘ʼ-]/u;
const COMBINING_TONE: Readonly<Record<string, Tone>> = { '\u0304': 1, '\u0301': 2, '\u030c': 3, '\u0300': 4 };
const DIAERESIS = '\u0308';
const CIRCUMFLEX = '\u0302';
/** Letters that may carry a tone mark: the vowels, plus m and n for syllables such as ǹg and ḿ. */
const MARKABLE = new Set(['a', 'e', 'i', 'o', 'u', 'ü', 'ê', 'm', 'n']);

/**
 * Reads typed pinyin without looking at any expected answer, so a screen can check the input
 * before recording it. The policy:
 * - case does not matter;
 * - tone marks (precomposed or combining) and tone digits after a syllable both work, and may mix
 *   within one answer ("nǐ hao3");
 * - 5 and 0 are the neutral tone, and so is a syllable with neither mark nor digit;
 * - `ü` is written `ü`, `v` or `u:`, with or without a tone ("lv4", "lu:4", "lǜ");
 * - spaces, apostrophes and hyphens between syllables are optional ("ni3hao3", "nǚ'ér").
 *
 * Anything else is a format error: punctuation, hanzi, the digits 6 to 9, a digit with no
 * syllable before it, a mark with no letter to sit on. Positions count UTF-16 code units of the
 * input after `u:` became `ü` and the text was decomposed (NFD).
 */
export const parsePinyinInput = (input: string): ParsedPinyin => {
  if (input.trim() === '') return { kind: 'empty' };
  const text = input.replace(/u:/gi, 'ü').normalize('NFD').toLowerCase();
  const tokens: PinyinToken[] = [];
  const errors: PinyinFormatError[] = [];
  let letters: PinyinLetter[] = [];
  const close = (digit: Tone | null) => {
    if (letters.length > 0) tokens.push({ letters, digit });
    letters = [];
  };

  for (let at = 0; at < text.length; at++) {
    const character = text[at];
    const last = letters[letters.length - 1];
    if (SEPARATOR.test(character)) {
      close(null);
    } else if (character >= 'a' && character <= 'z') {
      letters.push({ letter: character === 'v' ? 'ü' : character, mark: null });
    } else if (character in COMBINING_TONE) {
      if (!last || !MARKABLE.has(last.letter)) errors.push({ kind: 'misplaced-mark', at });
      else if (last.mark !== null) errors.push({ kind: 'stacked-marks', at });
      else last.mark = COMBINING_TONE[character];
    } else if (character === DIAERESIS) {
      if (last?.letter === 'u' && last.mark === null) last.letter = 'ü';
      else errors.push({ kind: 'misplaced-mark', at });
    } else if (character === CIRCUMFLEX) {
      if (last?.letter === 'e' && last.mark === null) last.letter = 'ê';
      else errors.push({ kind: 'misplaced-mark', at });
    } else if (character >= '0' && character <= '5') {
      if (!last) errors.push({ kind: 'misplaced-digit', character, at });
      else close(character === '0' ? 5 : (Number(character) as Tone));
    } else if (character >= '6' && character <= '9') {
      errors.push({ kind: 'unknown-tone-number', character, at });
    } else {
      errors.push({ kind: 'unexpected-character', character, at });
    }
  }
  close(null);
  if (errors.length === 0 && tokens.length === 0) errors.push({ kind: 'no-syllables' });
  if (errors.length > 0) return { kind: 'format-error', errors };
  return { kind: 'tokens', tokens };
};

/**
 * The letters a syllable is compared by. After j, q, x and y the ü is written u ("qù", "yú"), so
 * a learner's "qv4" and the catalog's "qù" are the same syllable. Elsewhere ü and u differ: "nu" is
 * not 女 nǚ, because 努 is nǔ. The search fold that equates them (`loosePinyin`) does not apply here.
 */
export const syllableBase = (letters: readonly Pick<PinyinLetter, 'letter'>[]): string => {
  const plain = letters.map(({ letter }) => letter).join('');
  return /^[jqxy]ü/.test(plain) ? plain[0] + 'u' + plain.slice(2) : plain;
};
