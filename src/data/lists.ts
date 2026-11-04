import type { HskLevel } from '../types';
import { extraVocabulary, vocabularyByLevel, vocabularyLevels, type VocabularyEntry } from './vocabulary';

/** What the learner studies: the HSK levels and the Extra list, all curated in the content editor. */
export type ListId = string;

export interface StudyList {
  id: ListId;
  title: string;
  words: VocabularyEntry[];
  /** Set on the HSK lists. Character packs and the character lane still go by level. */
  hskLevel?: HskLevel;
}

export const hskListId = (level: HskLevel): ListId => `hsk-${level}`;

/** Words outside HSK. Offered in the list picker even while empty, so learners can opt in to later releases. */
export const EXTRA_LIST: ListId = 'extra';

/** The lists that ship with the app. "Mis palabras" lives in stores/studyLists, since its words change. */
export const hskLists: StudyList[] = vocabularyLevels.map((level) => ({
  id: hskListId(level),
  title: `HSK ${level}`,
  words: vocabularyByLevel[level],
  hskLevel: level,
}));

/** Every list, Extra last. */
export const studyLists = (): StudyList[] => [
  ...hskLists,
  { id: EXTRA_LIST, title: 'Extra', words: extraVocabulary },
];

export const DEFAULT_LIST: ListId = hskListId(1);

/** Known ids only, each once, in catalog order. */
export const knownLists = (ids: readonly ListId[]): ListId[] =>
  studyLists().map((list) => list.id).filter((id) => ids.includes(id));

export const studyList = (id: ListId): StudyList | undefined => studyLists().find((list) => list.id === id);
const listHead = (id: ListId): StudyList => studyList(id)!;

/** The words of `ids`, each once. A word in two lists shares one progress, so it appears once. */
export const wordsInLists = (ids: readonly ListId[]): VocabularyEntry[] => {
  const seen = new Set<string>();
  const out: VocabularyEntry[] = [];
  for (const id of knownLists(ids)) {
    for (const word of studyList(id)!.words) {
      if (seen.has(word.id)) continue;
      seen.add(word.id);
      out.push(word);
    }
  }
  return out;
};

/** The HSK levels among `ids`, for what still goes by level. */
export const hskLevelsOf = (ids: readonly ListId[]): HskLevel[] =>
  knownLists(ids).flatMap((id) => listHead(id).hskLevel ?? []);

const joinSpanish = (parts: string[]) =>
  parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;

/** "HSK 1", "HSK 1 y 2", "HSK 1, 2 y 3", or the titles when a list is not HSK. */
export const listLabel = (ids: readonly ListId[]): string => {
  const lists = knownLists(ids).map(listHead);
  if (lists.length === 0) return 'HSK';
  if (lists.every((list) => list.hskLevel)) return `HSK ${joinSpanish(lists.map((list) => String(list.hskLevel)))}`;
  return joinSpanish(lists.map((list) => list.title));
};
