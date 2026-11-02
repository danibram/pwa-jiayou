import type { HskLevel } from '../types';
import { findWord, myWordsStore } from '../stores/myWordsStore';
import { vocabularyByLevel, vocabularyLevels, type VocabularyEntry } from './vocabulary';

/** What the learner studies. The HSK levels ship with the app; "Mis palabras" is the learner's own. */
export type ListId = string;

export interface StudyList {
  id: ListId;
  title: string;
  words: VocabularyEntry[];
  /** Set on the HSK lists. Character packs and the character lane still go by level. */
  hskLevel?: HskLevel;
}

export const hskListId = (level: HskLevel): ListId => `hsk-${level}`;

export const MY_WORDS_LIST: ListId = 'mine';

const hskLists: StudyList[] = vocabularyLevels.map((level) => ({
  id: hskListId(level),
  title: `HSK ${level}`,
  words: vocabularyByLevel[level],
  hskLevel: level,
}));

/** Every list, the learner's own last. Its words change as the learner adds them, so read it each time. */
export const studyLists = (): StudyList[] => [
  ...hskLists,
  { id: MY_WORDS_LIST, title: 'Mis palabras', words: myWordsStore.words() },
];

export const DEFAULT_LIST: ListId = hskListId(1);

export const studyList = (id: ListId): StudyList | undefined => studyLists().find((list) => list.id === id);

/** Known ids only, each once, in catalog order. */
export const knownLists = (ids: readonly ListId[]): ListId[] =>
  studyLists().map((list) => list.id).filter((id) => ids.includes(id));

/** The words of `ids`, each once. A word in two lists shares one progress, so it appears once. */
export const wordsInLists = (ids: readonly ListId[]): VocabularyEntry[] => {
  const seen = new Set<string>();
  const out: VocabularyEntry[] = [];
  for (const id of knownLists(ids)) {
    for (const word of studyList(id)!.words) {
      if (seen.has(word.id)) continue;
      seen.add(word.id);
      // A correction in Mis palabras wins over the stock HSK row.
      out.push(findWord(word.id) ?? word);
    }
  }
  return out;
};

/** The HSK levels among `ids`, for what still goes by level. */
export const hskLevelsOf = (ids: readonly ListId[]): HskLevel[] =>
  knownLists(ids).flatMap((id) => studyList(id)!.hskLevel ?? []);

const joinSpanish = (parts: string[]) =>
  parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;

/** "HSK 1", "HSK 1 y 2", "HSK 1, 2 y 3", or the titles when a list is not HSK. */
export const listLabel = (ids: readonly ListId[]): string => {
  const lists = knownLists(ids).map((id) => studyList(id)!);
  if (lists.length === 0) return 'HSK';
  if (lists.every((list) => list.hskLevel)) return `HSK ${joinSpanish(lists.map((list) => String(list.hskLevel)))}`;
  return joinSpanish(lists.map((list) => list.title));
};
