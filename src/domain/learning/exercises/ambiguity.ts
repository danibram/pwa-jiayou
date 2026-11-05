import { withToneSandhi } from '../../../utils/pinyin';
import { readingOf } from '../../../utils/soundAlike';
import type { WordEntry } from './types';

/** Lowercase, without accents or repeated spaces: "Feliz " and "feliz" are the same sense. */
export const fold = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');

/** The reading a card shows and speech says: the catalog reading with 一 and 不 sandhi applied. */
export const spokenReading = (word: WordEntry): string =>
  withToneSandhi(word.simplified.trim(), word.pinyin.normalize('NFC').trim().replace(/\s+/g, ' '));

// Words are immutable content, so derived keys are cached per object. A catalog has thousands.
const senseCache = new WeakMap<WordEntry, ReadonlySet<string>>();
export const senseKeys = (word: WordEntry): ReadonlySet<string> => {
  let keys = senseCache.get(word);
  if (!keys) senseCache.set(word, (keys = new Set(word.senses.map((sense) => fold(sense.text)))));
  return keys;
};

/** Two different words share at least one sense: 喜欢 and 爱 both answer to "querer". */
export const sharesSense = (a: WordEntry, b: WordEntry): boolean => {
  const keys = senseKeys(a);
  for (const key of senseKeys(b)) if (keys.has(key)) return true;
  return false;
};

const soundCache = new WeakMap<WordEntry, string>();
/**
 * A key equal for words speech says the same way: syllables and tones from `readingOf`, or the
 * lowercased reading when it is not plain pinyin.
 */
const soundKey = (word: WordEntry): string => {
  let key = soundCache.get(word);
  if (key === undefined) {
    const spoken = spokenReading(word);
    const reading = readingOf(spoken);
    key = reading ? `${reading.bases.join(' ')}|${reading.tones.join(' ')}` : `raw:${spoken.toLowerCase()}`;
    soundCache.set(word, key);
  }
  return key;
};

/** Same syllables in the same tones: 他 and 她, 在 and 再, 的, 地 and 得. */
export const soundsSame = (a: WordEntry, b: WordEntry): boolean => soundKey(a) === soundKey(b);

/** Another entry written the same way: 还 hái and 还 huán, 长 cháng and 长 zhǎng. */
export const isHomograph = (a: WordEntry, b: WordEntry): boolean =>
  a.id !== b.id && a.simplified.trim() === b.simplified.trim();

export const hasHomograph = (word: WordEntry, vocabulary: readonly WordEntry[]): boolean =>
  vocabulary.some((other) => isHomograph(word, other));

/** Another word, written differently, that speech would say the same way. */
export const hasHomophone = (word: WordEntry, vocabulary: readonly WordEntry[]): boolean =>
  vocabulary.some((other) => other.id !== word.id && other.simplified.trim() !== word.simplified.trim() && soundsSame(word, other));

/** Particles and classifiers, judged on the first sense. */
export const isFunctionWord = (word: Pick<WordEntry, 'senses'>): boolean => {
  const [first] = word.senses;
  return first?.pos === 'partícula' || first?.pos === 'clasificador' || /part[ií]cula|clasificador/i.test(first?.text ?? '');
};
