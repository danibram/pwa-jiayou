import rawIndex from '../data/searchIndex.json';
import type { ExampleWord, HSKCharacter, HskLevel } from '../types';
import { mainMeaning } from './meaning';
import { rankBy } from './searchRank';
import { withToneSandhi } from './pinyin';

export interface SearchIndexRow {
  character: string;
  traditional: string;
  pinyin: string;
  hsk_level: HskLevel;
  gloss: string;
  radical: string;
  example?: ExampleWord;
}

/** Examples follow the same spoken tones as the word lists (一个 yí ge). */
const indexRows = (rawIndex as SearchIndexRow[]).map((row) =>
  row.example ? { ...row, example: { ...row.example, pinyin: withToneSandhi(row.example.word, row.example.pinyin) } } : row,
);
const indexByChar = new Map(indexRows.map((row) => [row.character, row]));

export const hasHanInQuery = (text: string) => /\p{Script=Han}/u.test(text);

export type SearchHit =
  | { kind: 'listed'; row: SearchIndexRow }
  | { kind: 'device'; character: HSKCharacter };

export const isInSearchIndex = (character: string) => indexByChar.has(character);

/** Pinyin and gloss of any HSK 1-6 character, whether or not its list is on the device. */
export const indexRowFor = (character: string): SearchIndexRow | undefined => indexByChar.get(character);

/** HSK characters of `levels` built on `radical`, lower levels first, without `except` or the radical itself. */
export const charactersWithRadical = (radical: string, except: string, levels: readonly HskLevel[]): SearchIndexRow[] =>
  indexRows
    .filter((row) => row.radical === radical && row.character !== except && row.character !== radical && levels.includes(row.hsk_level))
    .sort((a, b) => a.hsk_level - b.hsk_level);

const allHits = (installed: readonly HSKCharacter[]): SearchHit[] => {
  const hits: SearchHit[] = indexRows.map((row) => ({ kind: 'listed', row }));
  for (const char of installed) {
    if (!indexByChar.has(char.character)) hits.push({ kind: 'device', character: char });
  }
  return hits;
};

const glossOf = (hit: SearchHit) =>
  hit.kind === 'device' ? hit.character.gloss ?? hit.character.definition : hit.row.gloss;

const searchableOf = (hit: SearchHit) =>
  hit.kind === 'device'
    ? { hanzi: [hit.character.character, hit.character.traditional], pinyin: hit.character.pinyin, gloss: glossOf(hit) }
    : { hanzi: [hit.row.character, hit.row.traditional], pinyin: hit.row.pinyin, gloss: glossOf(hit) };

const levelOf = (hit: SearchHit) => (hit.kind === 'device' ? hit.character.hsk_level : hit.row.hsk_level);

/**
 * Full index plus device-only rows when query is empty; ranked matches otherwise.
 * Characters from `levels` (the ones being studied) come first.
 */
export const searchCharacters = (query: string, installed: readonly HSKCharacter[], levels?: readonly HskLevel[]): SearchHit[] =>
  rankBy(allHits(installed), query, searchableOf, levels?.length ? (hit) => levels.includes(levelOf(hit)) : undefined);

export { pinyinSyllableHighlights } from './pinyinHighlights';

export const indexSize = () => indexRows.length;

const stubFromRow = (row: SearchIndexRow): HSKCharacter => ({
  character: row.character,
  traditional: row.traditional,
  pinyin: row.pinyin,
  definition: row.gloss,
  radical: row.radical,
  stroke_count: 0,
  hsk_level: row.hsk_level,
  general_standard: 0,
  frequency_rank: 0,
  gloss: row.gloss,
  example: row.example,
});

/** Prefer the installed record when the list is on the device. */
export const characterForHit = (
  hit: SearchHit,
  installed: readonly HSKCharacter[],
): HSKCharacter => {
  if (hit.kind === 'device') return hit.character;
  return installed.find((row) => row.character === hit.row.character) ?? stubFromRow(hit.row);
};

export const meaningForHit = (hit: SearchHit, installed: readonly HSKCharacter[]): string =>
  mainMeaning(characterForHit(hit, installed));

/** The installed record for any HSK character, or a stub from the search index when its list is not on the device. */
export const characterRecord = (character: string, installed: readonly HSKCharacter[]): HSKCharacter | undefined => {
  const row = installed.find((item) => item.character === character);
  if (row) return row;
  const listed = indexByChar.get(character);
  return listed ? stubFromRow(listed) : undefined;
};
