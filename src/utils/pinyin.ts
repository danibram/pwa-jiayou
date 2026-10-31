export type Tone = 1 | 2 | 3 | 4 | 5;

const TONE_MARKS: Record<string, Tone> = {
  ā: 1,
  ē: 1,
  ī: 1,
  ō: 1,
  ū: 1,
  ǖ: 1,
  á: 2,
  é: 2,
  í: 2,
  ó: 2,
  ú: 2,
  ǘ: 2,
  ǎ: 3,
  ě: 3,
  ǐ: 3,
  ǒ: 3,
  ǔ: 3,
  ǚ: 3,
  à: 4,
  è: 4,
  ì: 4,
  ò: 4,
  ù: 4,
  ǜ: 4,
};

/** Letters used in the CNS11643 syllable filenames. ü is v, ê is eh. */
const PLAIN: Record<string, string> = {
  ā: 'a',
  á: 'a',
  ǎ: 'a',
  à: 'a',
  ē: 'e',
  é: 'e',
  ě: 'e',
  è: 'e',
  ī: 'i',
  í: 'i',
  ǐ: 'i',
  ì: 'i',
  ō: 'o',
  ó: 'o',
  ǒ: 'o',
  ò: 'o',
  ū: 'u',
  ú: 'u',
  ǔ: 'u',
  ù: 'u',
  ǖ: 'v',
  ǘ: 'v',
  ǚ: 'v',
  ǜ: 'v',
  ü: 'v',
  ê: 'eh',
};

export const toneOf = (syllable: string): Tone => {
  for (const ch of syllable.toLowerCase()) {
    const tone = TONE_MARKS[ch];
    if (tone) return tone;
  }
  return 5;
};

/**
 * Filename stem for a syllable in the CNS11643 packs.
 * Tone 1 has no suffix (`ma`), tones 2–4 append the number, and an unmarked
 * syllable is the neutral tone (`ma5`).
 */
export const syllableKey = (syllable: string): string | null => {
  let tone: Tone | null = null;
  let base = '';
  for (const ch of syllable.trim().toLowerCase()) {
    if (ch in TONE_MARKS) tone = TONE_MARKS[ch];
    if (ch in PLAIN) base += PLAIN[ch];
    else if (ch >= 'a' && ch <= 'z') base += ch;
  }
  if (!base) return null;
  const resolved = tone ?? 5;
  return resolved === 1 ? base : `${base}${resolved}`;
};

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
