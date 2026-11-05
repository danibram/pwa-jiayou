// The single copy of the syllable and word id rules. The app, the editor and scripts/ import it as
// TypeScript source (Vite and Node 24 strip types), so there is no build step and no second copy
// to drift. Word ids are the key of saved progress: changing either rule orphans it.

export type Tone = 1 | 2 | 3 | 4 | 5;

export const TONE_MARKS: Readonly<Record<string, Tone>> = {
  ā: 1, á: 2, ǎ: 3, à: 4,
  ē: 1, é: 2, ě: 3, è: 4,
  ī: 1, í: 2, ǐ: 3, ì: 4,
  ō: 1, ó: 2, ǒ: 3, ò: 4,
  ū: 1, ú: 2, ǔ: 3, ù: 4,
  ǖ: 1, ǘ: 2, ǚ: 3, ǜ: 4,
  ń: 2, ň: 3, ǹ: 4,
};

/** Letters used in the CNS11643 syllable filenames. ü is v, ê is eh. */
export const PLAIN: Readonly<Record<string, string>> = {
  ā: 'a', á: 'a', ǎ: 'a', à: 'a',
  ē: 'e', é: 'e', ě: 'e', è: 'e',
  ī: 'i', í: 'i', ǐ: 'i', ì: 'i',
  ō: 'o', ó: 'o', ǒ: 'o', ò: 'o',
  ū: 'u', ú: 'u', ǔ: 'u', ù: 'u',
  ǖ: 'v', ǘ: 'v', ǚ: 'v', ǜ: 'v',
  ü: 'v', ê: 'eh',
  ń: 'n', ň: 'n', ǹ: 'n',
};

/**
 * Filename stem for a syllable in the CNS11643 packs (matches scripts/copy-cns-audio.py).
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

/**
 * A word's id: its hanzi, so any list that brings the same word shares its progress, then its
 * dictionary reading, one space-separated syllable per hanzi, so another reading gets its own id.
 */
export const wordId = (simplified: string, pinyin: string): string => {
  const hanzi = [...simplified].map((char) => char.codePointAt(0)!.toString(16));
  const syllables = pinyin.trim().split(/\s+/).map((syllable) => syllableKey(syllable));
  return `word-${[...hanzi, ...syllables].join('-')}`;
};
