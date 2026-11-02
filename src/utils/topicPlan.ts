import { vocabulary, type VocabularyEntry } from '../data/vocabulary';
import { MY_WORDS_LIST, wordsInLists, type ListId } from '../data/lists';
import { myWordsStore } from '../stores/myWordsStore';
import { vocabularyProgressStore as progress } from '../stores/vocabularyProgressStore';
import { vocabularyStore } from '../stores/vocabularyStore';
import { SESSION_SIZE } from '../stores/progressStore';

/** The topic's words within the lists, the checked ones by default, or every word when none is checked. */
export const topicWords = (topicIds: string[], lists?: ListId[]): VocabularyEntry[] => {
  const pool = lists ? wordsInLists(lists) : vocabularyStore.getSelectedWords();
  const fromLists = (pool.length ? pool : vocabulary).filter((entry) => topicIds.some((id) => entry.topicIds.includes(id)));
  // Own words tagged for these topics show in Temas even when «Mis palabras» is not checked for daily study.
  const mineChecked = lists ? lists.includes(MY_WORDS_LIST) : vocabularyStore.isSelected(MY_WORDS_LIST);
  if (mineChecked) return fromLists;
  const seen = new Set(fromLists.map((word) => word.id));
  const extras = myWordsStore.words().filter(
    (entry) => !seen.has(entry.id) && topicIds.some((id) => entry.topicIds.includes(id)),
  );
  return extras.length ? [...fromLists, ...extras] : fromLists;
};

export interface TopicPlan {
  /** New words a session would teach today, after the daily cap. */
  fresh: number;
  /** Words already met that a session would ask. */
  review: number;
  /** Unseen words remain but today's cap of new words is spent. */
  capped: boolean;
}

/** What "Estudiar" on these topics will do right now, so the button can say it before the tap. */
export const topicPlan = (topicIds: string[], lists?: ListId[]): TopicPlan => {
  const words = topicWords(topicIds, lists);
  const unseen = words.filter((entry) => progress.isNew(entry.id)).length;
  const seen = words.length - unseen;
  const left = progress.newLeftToday();
  const fresh = Math.min(unseen, left, SESSION_SIZE);
  return {
    fresh,
    review: Math.min(seen, SESSION_SIZE - fresh),
    capped: unseen > 0 && left === 0,
  };
};
