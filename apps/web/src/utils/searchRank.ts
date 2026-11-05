import { loosePinyin } from '@jiayou/chinese';

/** Something a search can find: a character or a word. */
export interface Searchable {
  hanzi: string[];
  pinyin: string;
  gloss: string | undefined;
}

export const foldSpanish = (text: string) =>
  text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const hasHan = (text: string) => /\p{Script=Han}/u.test(text);

/** Senses without notes in brackets: "agua; (líquido)" → ["agua"]. */
const senses = (gloss: string) =>
  foldSpanish(gloss)
    .replace(/\([^)]*\)/g, ' ')
    .split(/[;,/]/)
    .map((sense) => sense.trim())
    .filter(Boolean);

/**
 * A rough Spanish stem: drops infinitive and participle endings so "perdonar" meets "perdón"
 * and "comer" meets "comida" no. Only stems of 4+ letters count, so "ir" or "ser" stay whole.
 */
const STEM_ENDINGS = ['arse', 'erse', 'irse', 'ando', 'iendo', 'ado', 'ido', 'ar', 'er', 'ir'];
export const stemSpanish = (word: string): string => {
  for (const ending of STEM_ENDINGS) {
    if (word.endsWith(ending) && word.length - ending.length >= 4) return word.slice(0, -ending.length);
  }
  return word;
};

const glossScore = (gloss: string | undefined, needle: string, prefix = false): number => {
  if (!gloss || needle.length < 2) return 0;
  const folded = foldSpanish(gloss).trim();
  if (folded === needle) return 100;
  const list = senses(gloss);
  if (list[0] === needle) return 100;
  if (list.includes(needle)) return 90;
  const words = foldSpanish(gloss).split(/[^a-zñ0-9]+/);
  if (words.includes(needle)) return 70;
  // A phrase ("agua mineral") matches as a whole, not word by word.
  if (/[^a-zñ0-9]/.test(needle) && folded.includes(needle)) return 65;
  // Same word in another form: "perdonar" finds "perdón", "perdón" finds "perdonar".
  const stem = stemSpanish(needle);
  if (stem.length >= 4 && words.some((word) => word.length >= 4 && stemSpanish(word) === stem)) return 55;
  // Only as a last resort (see rankBy): "aguantar" must not answer "agua".
  if (prefix && words.some((word) => word.startsWith(needle))) return 45;
  return 0;
};

/**
 * Pinyin matches only from a syllable boundary, so "agua" does not hit bǎ guān.
 * The query may end inside a syllable ("bei j" or "beij" for Běijīng).
 */
const pinyinScore = (pinyin: string, query: string): number => {
  const needle = loosePinyin(query);
  if (!needle) return 0;
  let best = 0;
  for (const reading of pinyin.split(/[,;/]/)) {
    const syllables = reading.trim().split(/\s+/).map(loosePinyin).filter(Boolean);
    const whole = syllables.join('');
    if (whole === needle) return 80;
    for (let start = 0; start < syllables.length; start++) {
      if (syllables.slice(start).join('').startsWith(needle)) {
        best = Math.max(best, start === 0 ? 60 : 40);
        break;
      }
    }
  }
  return best;
};

/** Higher is better; 0 means no match. Exact gloss head word > gloss word > pinyin. */
export const searchScore = (item: Searchable, query: string, prefix = false): number => {
  const q = query.trim();
  if (!q) return 1;
  if (hasHan(q)) {
    if (item.hanzi.some((form) => form === q)) return 100;
    return item.hanzi.some((form) => form.includes(q)) ? 80 - Math.min(20, item.hanzi[0].length) : 0;
  }
  return Math.max(glossScore(item.gloss, foldSpanish(q), prefix), pinyinScore(item.pinyin, q));
};

/**
 * Keeps matches only, best first; ties keep their original (frequency) order.
 * With `inScope`, what the learner studies comes before the rest of HSK 1-6, each group by match quality.
 */
export const rankBy = <T>(
  items: readonly T[],
  query: string,
  toSearchable: (item: T) => Searchable,
  inScope?: (item: T) => boolean,
): T[] => {
  if (!query.trim()) return [...items];
  const group = (item: T) => (inScope && !inScope(item) ? 1 : 0);
  const rank = (prefix: boolean) =>
    items
      .map((item, index) => ({ item, index, group: group(item), score: searchScore(toSearchable(item), query, prefix) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => a.group - b.group || b.score - a.score || a.index - b.index)
      .map((row) => row.item);
  const whole = rank(false);
  // A long half-typed word ("mantequ") still finds something; a short one never sprawls.
  if (whole.length > 0 || foldSpanish(query.trim()).length < 5 || hasHan(query)) return whole;
  return rank(true);
};
