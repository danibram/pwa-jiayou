import { vocabulary } from '../data/vocabulary';
import { findWord, myWordsStore, normalizeMyWord, type MyWordInput } from '../stores/myWordsStore';
import { indexRowFor } from './characterSearch';
import { parsePinyinParts, wordId } from './pinyin';

export type WordLine =
  | { line: number; input: string; ok: true; value: Required<MyWordInput> }
  | { line: number; input: string; ok: false; error: string };

const catalogById = new Map(vocabulary.map((word) => [word.id, word]));

/** Tab first for spreadsheets, then the separators people type. The earliest one in the line wins. */
const SEPARATORS = [/\t/, /[;；]/, /\s\/\s/, /\s[-–]\s/];

const splitFields = (text: string): string[] => {
  let found: { index: number; length: number } | undefined;
  for (const separator of SEPARATORS) {
    const match = separator.exec(text);
    if (match && (!found || match.index < found.index)) found = { index: match.index, length: match[0].length };
  }
  if (!found) return [text];
  const sep = text.slice(found.index, found.index + found.length);
  // Only the first two separators split; a meaning may hold ";" or "/" of its own.
  const fields: string[] = [];
  let rest = text;
  while (fields.length < 2) {
    const at = rest.indexOf(sep);
    if (at < 0) break;
    fields.push(rest.slice(0, at).trim());
    rest = rest.slice(at + sep.length);
  }
  fields.push(rest.trim());
  return fields;
};

/** "nai3cha2" has no spaces; when the syllable count is off, cut after each tone digit. */
const spaceNumberedPinyin = (pinyin: string, count: number): string => {
  const tokens = pinyin.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === count || !/[1-5]/.test(pinyin)) return pinyin;
  return tokens.flatMap((token) => token.match(/[^1-5]+[1-5]?|[1-5]/g) ?? [token]).join(' ');
};

/** Numbered pinyin (`nai3 cha2`). Tone 1 keeps the digit so the line is unambiguous when pasted. */
export const numberedPinyin = (pinyin: string): string =>
  parsePinyinParts(pinyin).map(({ letters, tone }) => `${letters.replace(/ü/g, 'v')}${tone}`).join(' ');

/**
 * Dictionary reading encoded in a word id (`peng2 you5`). Catalog cards show sandhi; the id keeps
 * the tones that `parseWordList` needs to match HSK again.
 */
export const numberedPinyinFromWordId = (id: string, simplified: string): string | undefined => {
  const n = [...simplified].length;
  const parts = id.split('-');
  if (parts[0] !== 'word' || parts.length !== 1 + n + n) return undefined;
  return parts.slice(1 + n).map((key) => (/[1-5]$/.test(key) ? key : `${key}1`)).join(' ');
};

const catalogBySimplified = new Map<string, (typeof vocabulary)[number][]>();
for (const word of vocabulary) {
  const list = catalogBySimplified.get(word.simplified) ?? [];
  list.push(word);
  catalogBySimplified.set(word.simplified, list);
}

/** True when `pinyin` is a valid reading for this hanzi (meaning ignored). */
const readingFits = (hanzi: string, pinyin: string): boolean => {
  try {
    const count = [...hanzi.replace(/\s+/g, '')].length;
    normalizeMyWord({ simplified: hanzi, pinyin: spaceNumberedPinyin(pinyin, count), meaning: '-' });
    return true;
  } catch {
    return false;
  }
};

/**
 * First listed reading of each character. Empty when any glyph is unknown: the share text must
 * then carry the pinyin, because the other app cannot rebuild it.
 */
const pinyinFromCharacters = (simplified: string): string | undefined => {
  const readings = [...simplified].map((ch) => indexRowFor(ch)?.pinyin.split(/[\s,;/]+/).find(Boolean));
  return readings.every(Boolean) ? readings.join(' ') : undefined;
};

/** True when the other app can rebuild this reading from HSK or from the character index. */
const readingRecoverable = (simplified: string, pinyin: string): boolean => {
  const matches = catalogBySimplified.get(simplified) ?? [];
  if (matches.length === 1) {
    const catalog = matches[0];
    const catalogPinyin = numberedPinyinFromWordId(catalog.id, simplified) ?? numberedPinyin(catalog.pinyin);
    if (catalogPinyin === numberedPinyin(pinyin)) return true;
  }
  const fromChars = pinyinFromCharacters(simplified);
  return !!fromChars && numberedPinyin(fromChars) === numberedPinyin(pinyin);
};

/** HSK reading for this hanzi, or the character-index reading when every glyph is known. */
const fromCatalogHanzi = (simplified: string, meaning = ''): Required<MyWordInput> => {
  const matches = catalogBySimplified.get(simplified) ?? [];
  if (matches.length > 1) {
    throw new Error('Esa palabra tiene varias lecturas en HSK: añade el pinyin.');
  }
  if (matches.length === 1) {
    const catalog = matches[0];
    const pinyin = numberedPinyinFromWordId(catalog.id, simplified) ?? numberedPinyin(catalog.pinyin);
    return normalizeMyWord({ simplified, pinyin, meaning: meaning.trim() || catalog.meaning });
  }
  const pinyin = pinyinFromCharacters(simplified);
  if (!pinyin || !meaning.trim()) {
    throw new Error('No está en HSK: añade el pinyin y el significado.');
  }
  return normalizeMyWord({ simplified, pinyin, meaning: meaning.trim() });
};

const fromHanziPinyin = (hanzi: string, pinyin: string, meaning: string): Required<MyWordInput> => {
  const count = [...hanzi.replace(/\s+/g, '')].length;
  const spaced = spaceNumberedPinyin(pinyin, count);
  if (meaning) return normalizeMyWord({ simplified: hanzi, pinyin: spaced, meaning });
  // No meaning: fine for an HSK word, which brings its own.
  const checked = normalizeMyWord({ simplified: hanzi, pinyin: spaced, meaning: '-' });
  const catalog = catalogById.get(wordId(checked.simplified, checked.pinyin));
  if (!catalog) return normalizeMyWord({ simplified: hanzi, pinyin: spaced, meaning: '' });
  return { ...checked, meaning: catalog.meaning };
};

const parseLine = (raw: string): Required<MyWordInput> => {
  const [hanzi = '', second = '', ...rest] = splitFields(raw);
  const meaningTail = rest.join(' ').trim();
  if (!second && !meaningTail) {
    // Bare hanzi: only HSK words, whose reading the app already has.
    if (!hanzi) throw new Error('Separa la palabra, el pinyin y el significado con un tabulador, «;» o « / ».');
    return fromCatalogHanzi(hanzi.replace(/\s+/g, ''));
  }
  if (!meaningTail) {
    // Two fields: hanzi + pinyin (HSK) or hanzi + meaning (HSK without pinyin).
    if (readingFits(hanzi, second)) return fromHanziPinyin(hanzi, second, '');
    return fromCatalogHanzi(hanzi.replace(/\s+/g, ''), second);
  }
  if (!second) throw new Error('Separa la palabra, el pinyin y el significado con un tabulador, «;» o « / ».');
  return fromHanziPinyin(hanzi, second, meaningTail);
};

/** One word per line: hanzi, pinyin, meaning. Blank lines and lines starting with "#" are skipped. Writes nothing. */
export const parseWordList = (text: string): WordLine[] =>
  text.split(/\r?\n|\r/).flatMap((raw, index): WordLine[] => {
    const input = raw.trim();
    if (!input || input.startsWith('#')) return [];
    const line = index + 1;
    try {
      return [{ line, input, ok: true, value: parseLine(input) }];
    } catch (failure) {
      return [{ line, input, ok: false, error: failure instanceof Error ? failure.message : 'No se pudo leer la línea.' }];
    }
  });

/** The id the word would get, and whether HSK already has it. */
export const wordKind = (word: Required<MyWordInput>): { id: string; inCatalog: boolean } => {
  const id = wordId(word.simplified, word.pinyin);
  return { id, inCatalog: catalogById.has(id) };
};

/** One pasteable line: hanzi, numbered pinyin, meaning, tab-separated. */
export const formatWordLine = (word: { simplified: string; pinyin: string; meaning: string }): string =>
  `${word.simplified}\t${numberedPinyin(word.pinyin)}\t${word.meaning}`;

/** The same format `parseWordList` reads. Empty list → empty string. */
export const formatWordList = (words: readonly { simplified: string; pinyin: string; meaning: string }[]): string =>
  words.map(formatWordLine).join('\n');

/**
 * Mis palabras as paste text, in the order they were added. Skips pinyin when the other app can
 * rebuild it from HSK or from the character index (the syllables already live there).
 */
export const formatMyWordsList = (): string =>
  myWordsStore.ids.flatMap((id) => {
    const own = myWordsStore.own(id);
    if (own) {
      return [readingRecoverable(own.simplified, own.pinyin) ? `${own.simplified}\t${own.meaning}` : formatWordLine(own)];
    }
    const word = findWord(id);
    if (!word) return [];
    return [`${word.simplified}\t${word.meaning}`];
  }).join('\n');

export type ShareWordListResult = 'shared' | 'copied';

/** Web Share when the browser offers it; otherwise the clipboard. AbortError means the user closed the sheet. */
export const shareWordListText = async (text: string): Promise<ShareWordListResult> => {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Mis palabras · Jiāyóu', text });
      return 'shared';
    } catch (failure) {
      if (failure instanceof Error && failure.name === 'AbortError') throw failure;
    }
  }
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    throw new Error('No se pudo compartir ni copiar la lista.');
  }
  await navigator.clipboard.writeText(text);
  return 'copied';
};
