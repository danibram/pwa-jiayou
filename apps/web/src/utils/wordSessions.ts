import { topicById } from '../data/topics';
import type { SessionScope } from '@jiayou/learning/sessions';
import type { SessionMode, SessionState } from '@jiayou/learning/types';
import { wordIdOf, wordItemId } from '@jiayou/learning/items';

/**
 * Word sessions are named in the URL and in history by a practice id: none for Hoy, `__more__`,
 * `__weak__`, `__all__`, `topic:<id>[,<id>]`, or a word id. The learning session takes a mode and a
 * scope; these helpers translate between the two.
 */
export const MORE_ID = '__more__';
export const WEAK_ID = '__weak__';
export const ALL_ID = '__all__';
const TOPIC_PREFIX = 'topic:';

export interface WordSessionTarget {
  mode: SessionMode;
  scope: SessionScope;
  /** The screen title. */
  heading: string;
  topicIds?: string[];
  wordId?: string;
}

export const topicTitle = (topicIds: readonly string[]) => {
  const titles = topicIds.map((id) => topicById(id)?.title).filter((title): title is string => !!title);
  if (titles.length === 0) return 'Tema';
  if (titles.length <= 2) return titles.join(' y ');
  return `${titles.length} temas`;
};

export const sessionTarget = (practiceId?: string): WordSessionTarget => {
  if (!practiceId) return { mode: 'today', scope: { kind: 'all' }, heading: 'Hoy' };
  if (practiceId === MORE_ID) return { mode: 'more-words', scope: { kind: 'all' }, heading: 'Más palabras' };
  if (practiceId === WEAK_ID) return { mode: 'weak', scope: { kind: 'all' }, heading: 'Flojos' };
  if (practiceId === ALL_ID) return { mode: 'review-all', scope: { kind: 'all' }, heading: 'Repasar todo' };
  if (practiceId.startsWith(TOPIC_PREFIX)) {
    const topicIds = practiceId.slice(TOPIC_PREFIX.length).split(',').filter(Boolean);
    return { mode: 'topic', scope: { kind: 'topics', topicIds }, heading: topicTitle(topicIds), topicIds };
  }
  return { mode: 'word', scope: { kind: 'item', itemId: wordItemId(practiceId) }, heading: 'Práctica', wordId: practiceId };
};

/** The practice id and title of a stored session, for "Continuar sesión". */
export const practiceIdOf = (session: Pick<SessionState, 'mode' | 'scope'>): { practiceId?: string; title: string } => {
  const { mode, scope } = session;
  if (scope.kind === 'item') return { practiceId: wordIdOf(scope.itemId) ?? '', title: 'Práctica' };
  if (scope.kind === 'topics') return { practiceId: `${TOPIC_PREFIX}${scope.topicIds.join(',')}`, title: topicTitle(scope.topicIds) };
  if (mode === 'more-words') return { practiceId: MORE_ID, title: 'Más palabras' };
  if (mode === 'weak') return { practiceId: WEAK_ID, title: 'Flojos' };
  if (mode === 'review-all') return { practiceId: ALL_ID, title: 'Repasar todo' };
  return { title: 'Hoy' };
};
