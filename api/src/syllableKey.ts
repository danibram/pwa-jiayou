const TONE_MARKS: Record<string, 1 | 2 | 3 | 4 | 5> = {
  ā: 1, á: 2, ǎ: 3, à: 4,
  ē: 1, é: 2, ě: 3, è: 4,
  ī: 1, í: 2, ǐ: 3, ì: 4,
  ō: 1, ó: 2, ǒ: 3, ò: 4,
  ū: 1, ú: 2, ǔ: 3, ù: 4,
  ǖ: 1, ǘ: 2, ǚ: 3, ǜ: 4,
};

const PLAIN: Record<string, string> = {
  ā: 'a', á: 'a', ǎ: 'a', à: 'a',
  ē: 'e', é: 'e', ě: 'e', è: 'e',
  ī: 'i', í: 'i', ǐ: 'i', ì: 'i',
  ō: 'o', ó: 'o', ǒ: 'o', ò: 'o',
  ū: 'u', ú: 'u', ǔ: 'u', ù: 'u',
  ǖ: 'v', ǘ: 'v', ǚ: 'v', ǜ: 'v',
  ü: 'v', ê: 'eh',
};

/** Filename stem for CNS11643 syllable clips (matches scripts/syllable-keys.mjs). */
export const syllableKey = (syllable: string): string | null => {
  let tone: 1 | 2 | 3 | 4 | 5 | null = null;
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

const tokens = (pinyin: string) => pinyin.split(/[\s,;/]+/).filter(Boolean);

/** First reading syllable key for a character row. */
export const citationSyllableKey = (pinyin: string): string | null => {
  const first = tokens(pinyin)[0];
  return first ? syllableKey(first) : null;
};
