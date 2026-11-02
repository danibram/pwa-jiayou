// Syllable filename stems for CNS11643 / app audio (matches scripts/copy-cns-audio.py).
const TONES = {
  ā: 1, á: 2, ǎ: 3, à: 4,
  ē: 1, é: 2, ě: 3, è: 4,
  ī: 1, í: 2, ǐ: 3, ì: 4,
  ō: 1, ó: 2, ǒ: 3, ò: 4,
  ū: 1, ú: 2, ǔ: 3, ù: 4,
  ǖ: 1, ǘ: 2, ǚ: 3, ǜ: 4,
  ń: 2, ň: 3, ǹ: 4,
};

const PLAIN = {
  ā: 'a', á: 'a', ǎ: 'a', à: 'a',
  ē: 'e', é: 'e', ě: 'e', è: 'e',
  ī: 'i', í: 'i', ǐ: 'i', ì: 'i',
  ō: 'o', ó: 'o', ǒ: 'o', ò: 'o',
  ū: 'u', ú: 'u', ǔ: 'u', ù: 'u',
  ǖ: 'v', ǘ: 'v', ǚ: 'v', ǜ: 'v',
  ü: 'v', ê: 'eh',
  ń: 'n', ň: 'n', ǹ: 'n',
};

export const syllableKey = (syllable) => {
  let tone = null;
  let base = '';
  for (const ch of syllable.trim().toLowerCase()) {
    if (ch in TONES) tone = TONES[ch];
    if (ch in PLAIN) base += PLAIN[ch];
    else if (ch >= 'a' && ch <= 'z') base += ch;
  }
  if (!base) return null;
  const resolved = tone ?? 5;
  return resolved === 1 ? base : `${base}${resolved}`;
};

const tokens = (pinyin) => pinyin.split(/[\s,;/]+/).filter(Boolean);

/**
 * A word's id: its hanzi, so any list that brings the same word shares its progress,
 * then its reading, so another reading of the same hanzi gets its own id.
 */
export const wordId = (simplified, pinyin) => {
  const hanzi = [...simplified].map((char) => char.codePointAt(0).toString(16));
  const syllables = pinyin.trim().split(/\s+/).map((syllable) => syllableKey(syllable));
  return `word-${[...hanzi, ...syllables].join('-')}`;
};

/** All MP3 stems needed for these character rows (readings + example words). */
export const syllableKeysForRows = (rows, charPinyin = (row) => row.pinyin) => {
  const chars = new Map(rows.map((row) => [row.character, charPinyin(row)]));
  const keys = new Set();

  for (const pinyin of chars.values()) {
    for (const token of tokens(pinyin)) {
      const key = syllableKey(token);
      if (key) keys.add(key);
    }
  }

  for (const row of rows) {
    const example = row.example;
    if (!example?.pinyin || !example?.word) continue;
    const syls = tokens(example.pinyin);
    const hanzi = [...example.word];
    const aligned = hanzi.length === syls.length;
    for (let index = 0; index < syls.length; index++) {
      const key = syllableKey(syls[index]);
      if (key) keys.add(key);
      if (!aligned) continue;
      const cited = tokens(chars.get(hanzi[index]) ?? '')[0];
      const citation = cited ? syllableKey(cited) : null;
      if (citation) keys.add(citation);
    }
  }

  return [...keys].sort();
};
