import type { HskLevel } from '../types';
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
export const MY_WORDS_TITLE = 'Mis palabras';

/** The lists that ship with the app. "Mis palabras" lives in stores/studyLists, since its words change. */
export const hskLists: StudyList[] = vocabularyLevels.map((level) => ({
  id: hskListId(level),
  title: `HSK ${level}`,
  words: vocabularyByLevel[level],
  hskLevel: level,
}));

/** Every list's id and title, the learner's own last. Knowing them needs no words. */
const listHeads: Omit<StudyList, 'words'>[] = [
  ...hskLists.map(({ id, title, hskLevel }) => ({ id, title, hskLevel })),
  { id: MY_WORDS_LIST, title: MY_WORDS_TITLE },
];

export const DEFAULT_LIST: ListId = hskListId(1);

/** Known ids only, each once, in catalog order. */
export const knownLists = (ids: readonly ListId[]): ListId[] =>
  listHeads.map((list) => list.id).filter((id) => ids.includes(id));

const listHead = (id: ListId) => listHeads.find((list) => list.id === id)!;

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
