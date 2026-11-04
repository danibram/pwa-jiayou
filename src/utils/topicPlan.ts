import { allWords, type VocabularyEntry } from '../data/vocabulary';
import { wordsInLists, type ListId } from '../data/lists';
import { topicScope } from '../data/topics';
import { vocabularyProgressStore as progress } from '../stores/vocabularyProgressStore';
import { vocabularyStore } from '../stores/vocabularyStore';
import { SESSION_SIZE } from '../stores/progressStore';

/** The topic's words within the lists, the checked ones by default, or every word when none is checked.
 *  A theme id also matches words tagged with any of its subtopics. */
export const topicWords = (topicIds: string[], lists?: ListId[]): VocabularyEntry[] => {
  const pool = lists ? wordsInLists(lists) : vocabularyStore.getSelectedWords();
  const scope = new Set(topicIds.flatMap((id) => topicScope(id)));
  return (pool.length ? pool : allWords()).filter((entry) => entry.topicIds.some((id) => scope.has(id)));
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
