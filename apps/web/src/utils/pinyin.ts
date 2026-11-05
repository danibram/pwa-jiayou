import { PLAIN, TONE_MARKS, type Tone } from '../../../../shared/pinyin/index.ts';

export type { Tone };
export { syllableKey, wordId } from '../../../../shared/pinyin/index.ts';

/** Lowercase letters only, tone marks stripped. Matches syllable key folding without the tone suffix. */
export const foldPinyin = (text: string): string => {
  let out = '';
  for (const ch of text.trim().toLowerCase()) {
    if (ch in PLAIN) out += PLAIN[ch];
    else if (ch >= 'a' && ch <= 'z') out += ch;
  }
  return out;
};

/**
 * Search fold: ü (CNS `v`) also meets plain `u`, so typing "nu" finds 女 nǚ and "lu" finds 绿 lǜ.
 * Filenames and syllable keys keep `v`; only ranking uses this.
 */
export const loosePinyin = (text: string): string => foldPinyin(text).replace(/v/g, 'u');

export const toneOf = (syllable: string): Tone => {
  for (const ch of syllable.toLowerCase()) {
    const tone = TONE_MARKS[ch];
    if (tone) return tone;
  }
  return 5;
};

const MARKED: Record<string, string> = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', ü: 'ǖǘǚǜ' };

/**
 * "ni3 hao3" or "lv4" as written on a keyboard, to "nǐ hǎo" and "lǜ". The mark goes on a or e,
 * on the o of ou, otherwise on the last vowel. Syllables that already carry marks stay as they are.
 */
export const markTones = (pinyin: string): string =>
  pinyin.trim().toLowerCase().split(/\s+/).map((raw) => {
    const match = /^([a-zü:v]+)([1-5])$/.exec(raw);
    if (!match) return raw;
    const letters = match[1].replace(/v|u:/g, 'ü');
    const tone = Number(match[2]);
    if (tone === 5) return letters;
    const at = /[ae]/.test(letters) ? letters.search(/[ae]/) : letters.includes('ou') ? letters.indexOf('o') : Math.max(...[...'iouü'].map((v) => letters.lastIndexOf(v)));
    if (at < 0) return letters;
    return letters.slice(0, at) + MARKED[letters[at]][tone - 1] + letters.slice(at + 1);
  }).join(' ');

/** Letters of a syllable with marks stripped. ü stays ü (not the CNS `v`). */
export const bareLetters = (syllable: string): string => {
  let out = '';
  for (const ch of syllable.trim().toLowerCase()) {
    if (ch in PLAIN) {
      const plain = PLAIN[ch];
      out += plain === 'v' ? 'ü' : plain === 'eh' ? 'ê' : plain;
    } else if ((ch >= 'a' && ch <= 'z') || ch === 'ü' || ch === 'ê') out += ch;
  }
  return out;
};

/** One syllable as typed in the editor: bare letters plus a tone number. */
export type SyllableParts = { letters: string; tone: Tone };

/** Reads a syllable written with marks (`nǎi`) or a tone digit (`nai3`). */
export const parseSyllableParts = (raw: string): SyllableParts => {
  const trimmed = raw.trim().toLowerCase().replace(/u:/g, 'ü');
  const numbered = /^([a-züvê]+)([1-5])$/.exec(trimmed);
  if (numbered) return { letters: numbered[1].replace(/v/g, 'ü'), tone: Number(numbered[2]) as Tone };
  return { letters: bareLetters(trimmed), tone: toneOf(trimmed) };
};

/** Puts the tone mark back on the letters, the same way `markTones` does for `nai3`. */
export const joinSyllableParts = ({ letters, tone }: SyllableParts): string => {
  const base = letters.trim().toLowerCase().replace(/ü|u:/g, 'v');
  if (!base) return '';
  return markTones(`${base}${tone}`);
};

export const parsePinyinParts = (pinyin: string): SyllableParts[] =>
  pinyin.trim() ? pinyin.trim().split(/\s+/).map(parseSyllableParts) : [];

export const joinPinyinParts = (parts: SyllableParts[]): string =>
  parts.map(joinSyllableParts).filter(Boolean).join(' ');

/** Syllables in order. A comma between readings waits longer than a space inside a word. */
export const pinyinParts = (pinyin: string): { syllable: string; gap: number }[] => {
  const bits = pinyin.split(/([\s,;/]+)/).filter((part) => part.length > 0);
  const out: { syllable: string; gap: number }[] = [];
  let gap = 0;
  for (const bit of bits) {
    if (/^[\s,;/]+$/.test(bit)) {
      gap = /[,;/]/.test(bit) ? 280 : 80;
      continue;
    }
    out.push({ syllable: bit, gap });
    gap = 80;
  }
  return out;
};

/** Splits a pinyin string into syllable-ish tokens and the separators between them. */
export const splitPinyin = (pinyin: string): { text: string; tone: Tone | null }[] =>
  pinyin
    .split(/([\s,;/]+)/)
    .filter((part) => part.length > 0)
    .map((part) =>
      /^[\s,;/]+$/.test(part) ? { text: part, tone: null } : { text: part, tone: toneOf(part) }
    );

export type PinyinToken = { text: string; tone: Tone | null };

const VOWEL_START = /^[aeoāáǎàēéěèōóǒò]/i;
/** Longest word the segmenter tries, in syllables. HSK entries top out at five. */
const MAX_WORD = 6;

/**
 * Display tokens with the syllables of one word written together (Běijīng, bàba),
 * and an apostrophe before a vowel-initial syllable inside a word (Xī'ān).
 * `isWord` says whether a run of syllables is a single word; the longest match wins.
 * Separators other than spaces (commas between readings) are kept as they are.
 */
/** Structural particles written apart even after the word they follow: shì de, hǎo ma, nǐ ne. */
const LOOSE_PARTICLES = new Set(['de', 'ma', 'ne']);
/** A run ending in a particle, unless the particle repeats the syllable before it (mā ma is māma). */
export const endsInParticle = (syllables: string[]) => {
  if (syllables.length < 2) return false;
  const last = syllables[syllables.length - 1].toLowerCase();
  const before = syllables[syllables.length - 2].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return LOOSE_PARTICLES.has(last) && before !== last;
};

export const groupPinyin = (pinyin: string, isWord: (syllables: string[]) => boolean): PinyinToken[] => {
  const tokens = splitPinyin(pinyin);
  const out: PinyinToken[] = [];
  let run: PinyinToken[] = [];

  const flush = () => {
    let i = 0;
    while (i < run.length) {
      let end = i + 1;
      for (let j = Math.min(run.length, i + MAX_WORD); j > i + 1; j--) {
        const syllables = run.slice(i, j).map((part) => part.text);
        if (isWord(syllables)) {
          end = j;
          break;
        }
      }
      if (i > 0) out.push({ text: ' ', tone: null });
      for (let k = i; k < end; k++) {
        if (k > i && VOWEL_START.test(run[k].text)) out.push({ text: "'", tone: null });
        out.push(run[k]);
      }
      i = end;
    }
    run = [];
  };

  for (const token of tokens) {
    if (token.tone !== null) run.push(token);
    else if (/^\s+$/.test(token.text)) continue;
    else {
      flush();
      out.push(token);
    }
  }
  flush();
  return out;
};

/** Every syllable belongs to one word: an example word, a list entry, a label for a single word. */
export const oneWord = (syllables: string[]): boolean => !endsInParticle(syllables);

/** Plain-text pinyin for a single word, for labels and accessible names: "bà ba" reads "bàba". */
export const formatPinyinWord = (pinyin: string): string =>
  groupPinyin(pinyin, oneWord).map((token) => token.text).join('');

const NUMERALS = new Set('〇零一二三四五六七八九十百千万亿两第');
/** 一 keeps its first tone in dates: 一月, 一号, 一日. */
const DATE_UNITS = new Set('月号日');

/**
 * Spoken tones for 一 and 不 inside a word, the way learners hear them:
 * 不 before a fourth tone is bú (bú kèqi), 一 is yí before a fourth tone (yí ge) and yì
 * before the others (yì qǐ). Numbers, ordinals and dates keep yī (第一, 十一, 一月).
 * Syllables must line up one to one with the characters, or the pinyin is returned unchanged.
 */
export const withToneSandhi = (hanzi: string, pinyin: string): string => {
  const chars = [...hanzi];
  if (!chars.some((char) => char === '一' || char === '不')) return pinyin;
  const parts = pinyin.split(/(\s+)/);
  const syllables = parts.filter((part) => part.trim());
  if (syllables.length !== chars.length) return pinyin;
  // 个 is written ge but is a fourth tone underneath, which is what the rule looks at.
  const underlying = (i: number) => (chars[i] === '个' ? 4 : toneOf(syllables[i]));
  const next = syllables.map((syllable, i) => {
    if (i + 1 >= chars.length) return syllable;
    const lower = syllable.toLowerCase();
    const after = underlying(i + 1);
    if (chars[i] === '不' && lower === 'bù' && after === 4) return syllable[0] + 'ú';
    if (chars[i] === '一' && lower === 'yī') {
      if (i > 0 && NUMERALS.has(chars[i - 1])) return syllable;
      if (NUMERALS.has(chars[i + 1]) || DATE_UNITS.has(chars[i + 1])) return syllable;
      if (after === 4) return syllable[0] + 'í';
      if (after === 1 || after === 2 || after === 3) return syllable[0] + 'ì';
    }
    return syllable;
  });
  let k = 0;
  return parts.map((part) => (part.trim() ? next[k++] : part)).join('');
};
