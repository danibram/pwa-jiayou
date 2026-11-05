import { createSignal } from 'solid-js';
import {
  parseVocabularyEntry,
  parseVocabularyList,
  type CatalogEntry,
  type HskLevel,
  type VocabularyEntry,
  type VocabularyExample,
  wordExamples,
} from '@jiayou/content';
// Only HSK 1 ships inside the app. HSK 2 to 6 arrive with their level's pack (packs/hskN/words.json)
// when the learner activates the list, through installLevelWords.
import hsk1 from './vocabulary/hsk1.json';
import extra from './vocabulary/extra.json';
import examples from './vocabulary/examples.json';

export type { CatalogEntry, VocabularyEntry, VocabularyExample, WordPos, WordRelation, WordRelationKind, WordSense } from '@jiayou/content';

export const vocabularyExample = (simplified: string, proposed?: VocabularyExample | null): VocabularyExample | undefined =>
  proposed === undefined ? (examples as Record<string, VocabularyExample>)[simplified] : proposed ?? undefined;

/** Every sentence a word shows: its list, or the single legacy sentence, or the sidecar one. */
export const vocabularyExamples = (word: Pick<VocabularyEntry, 'simplified' | 'examples' | 'example'>): VocabularyExample[] =>
  wordExamples(word, (examples as Record<string, VocabularyExample>)[word.simplified]);

export const vocabularyLevels: HskLevel[] = [1, 2, 3, 4, 5, 6];

/** The HSK level whose words ship inside the app. The others download with their pack. */
export const BUNDLED_WORD_LEVEL: HskLevel = 1;

/** Words the content editor files outside the HSK lists. They arrive with app updates and form the «Extra» list. */
export const extraVocabulary: VocabularyEntry[] = (Array.isArray(extra) ? extra : []).map((raw) => {
  const { level: _level, ...entry } = parseVocabularyEntry(raw, true);
  return entry;
});

export const EXTRA_SOURCE = 'curated-extra';
/** True for a word of the Extra list. */
export const isExtraWord = (word: VocabularyEntry): boolean => !word.level;

/** The words of each level on the device. Reading it inside a memo re-runs the memo when a level arrives or leaves. */
const [loadedLevels, setLoadedLevels] = createSignal<Partial<Record<HskLevel, CatalogEntry[]>>>({
  [BUNDLED_WORD_LEVEL]: parseVocabularyList(hsk1, BUNDLED_WORD_LEVEL),
});

let index: { every: VocabularyEntry[]; byId: Map<string, VocabularyEntry> } | null = null;
const wordIndex = () => {
  const levels = loadedLevels();
  if (!index) {
    const every = [...vocabularyLevels.flatMap((level) => levels[level] ?? []), ...extraVocabulary];
    index = { every, byId: new Map(every.map((word) => [word.id, word])) };
  }
  return index;
};

/** Parse a level's word list and make it available. Throws if the list is not that level's. */
export const installLevelWords = (level: HskLevel, raw: unknown) => {
  const words = parseVocabularyList(raw, level);
  index = null;
  setLoadedLevels((current) => ({ ...current, [level]: words }));
};

/** Forget a downloaded level. HSK 1 always stays. */
export const removeLevelWords = (level: HskLevel) => {
  if (level === BUNDLED_WORD_LEVEL || !loadedLevels()[level]) return;
  index = null;
  setLoadedLevels((current) => {
    const next = { ...current };
    delete next[level];
    return next;
  });
};

export const hasLevelWords = (level: HskLevel): boolean => !!loadedLevels()[level];

/** The words of `level` on the device, or none until its pack is downloaded. */
export const levelWords = (level: HskLevel): CatalogEntry[] => loadedLevels()[level] ?? [];

/** Every HSK word on the device, HSK 1 first. Not the learner's selection: see vocabularyStore.getSelectedWords. */
export const catalogWords = (): CatalogEntry[] => vocabularyLevels.flatMap(levelWords);

/** Every word on the device: the HSK levels downloaded, then Extra. */
export const allWords = (): VocabularyEntry[] => wordIndex().every;

/** A word on the device by id. Words of a level that is not downloaded are not found. */
export const findWord = (id: string): VocabularyEntry | undefined => wordIndex().byId.get(id);

/**
 * Characters of Extra words in these topics that are not a one-character word in `words`,
 * so Temas teaches the pieces of words outside HSK too.
 */
export const charactersOfExtraTopicWords = (topicIds: readonly string[], words: readonly VocabularyEntry[]): string[] => {
  if (topicIds.length === 0) return [];
  const asWord = new Set(words.map((word) => word.simplified));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of words) {
    if (!isExtraWord(word) || !topicIds.some((id) => word.topicIds.includes(id))) continue;
    for (const char of word.characters) {
      if (seen.has(char) || asWord.has(char)) continue;
      seen.add(char);
      out.push(char);
    }
  }
  return out;
};

/** How many words a level has, whether or not it is downloaded. */
export function wordCount(level: HskLevel): number {
  return typeof __WORD_COUNTS__ === 'object' ? __WORD_COUNTS__[level] ?? 0 : levelWords(level).length;
}

/** Word counts in the original HSK 2.0 source, before editorial additions and level changes. */
export const officialCounts: Record<HskLevel, number> = { 1: 150, 2: 147, 3: 298, 4: 598, 5: 1298, 6: 2500 };

export const vocabularyCoverage = {
  edition: 'HSK 2.0',
  levels: [1, 2, 3, 4, 5, 6] as const satisfies readonly HskLevel[],
  complete: true,
  description: 'Vocabulario HSK 2.0 completo, con ajustes editoriales por nivel',
  // Counted from the lists at build time (vite.config.ts), since the content editor can file new words
  // under a level (HSK 1 has 你好 on top of the 150) and most lists are not on the device.
  counts: Object.fromEntries(vocabularyLevels.map((level) => [level, wordCount(level)])) as Record<HskLevel, number>,
};
