import { loosePinyin, pinyinParts } from './pinyin';

/** One flag per syllable (pinyinParts order) for toneless query overlap. */
export const pinyinSyllableHighlights = (pinyin: string, query: string): boolean[] => {
  const q = query.trim();
  if (!q || /\p{Script=Han}/u.test(q)) return [];
  const needle = loosePinyin(q);
  if (!needle) return [];

  const parts = pinyinParts(pinyin);
  const folded = parts.map((part) => loosePinyin(part.syllable));
  const joined = folded.join('');
  if (!joined.includes(needle)) return parts.map(() => false);

  const spans: { start: number; end: number }[] = [];
  let from = 0;
  while (from <= joined.length - needle.length) {
    const at = joined.indexOf(needle, from);
    if (at === -1) break;
    spans.push({ start: at, end: at + needle.length });
    from = at + 1;
  }

  let pos = 0;
  return folded.map((fold) => {
    const start = pos;
    pos += fold.length;
    const end = pos;
    return spans.some((span) => end > span.start && start < span.end);
  });
};

