import { syllableKey } from '../../shared/pinyin/index.ts';

export { syllableKey };

const tokens = (pinyin: string) => pinyin.split(/[\s,;/]+/).filter(Boolean);

/** First reading syllable key for a character row. */
export const citationSyllableKey = (pinyin: string): string | null => {
  const first = tokens(pinyin)[0];
  return first ? syllableKey(first) : null;
};
