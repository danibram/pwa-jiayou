// Syllable filename stems for CNS11643 / app audio (matches scripts/copy-cns-audio.py).
import { syllableKey, wordId } from '../shared/pinyin/index.ts';

export { syllableKey, wordId };

const tokens = (pinyin) => pinyin.split(/[\s,;/]+/).filter(Boolean);

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
