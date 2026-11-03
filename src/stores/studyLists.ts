import { hskLists, knownLists, MY_WORDS_LIST, MY_WORDS_TITLE, type ListId, type StudyList } from '../data/lists';
import type { VocabularyEntry } from '../data/vocabulary';
import { findWord, myWordsStore } from './myWordsStore';

/** Every list, the learner's own last. Its words change as the learner adds them, so read it each time. */
export const studyLists = (): StudyList[] => [
  ...hskLists,
  { id: MY_WORDS_LIST, title: MY_WORDS_TITLE, words: myWordsStore.words() },
];

export const studyList = (id: ListId): StudyList | undefined => studyLists().find((list) => list.id === id);

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
