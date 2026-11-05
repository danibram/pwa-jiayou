import type { SessionSettings } from './types.ts';

/**
 * Defaults taken from the current app, with work counted in cards:
 * - 20 new words a day (`WORD_NEW_PER_DAY`), 10 of them from Hoy (`NEW_PER_DAY`), 10 per session
 *   (`MORE_SIZE`); 8 new characters a day (`CHAR_NEW_PER_DAY`);
 * - 30 cards a session: the old session held up to 20 items, and its ten new words took three places
 *   each. A new item is now two cards (teach and one practice), so ten new words and ten reviews fill it;
 * - 20 practice cards (`SESSION_SIZE`);
 * - at most 10 cards added by Again, two per item.
 */
export const DEFAULT_SESSION_SETTINGS: SessionSettings = {
  newPerDay: { 'word-meaning': 20, 'character-writing': 8 },
  todayNewPerDay: { 'word-meaning': 10, 'character-writing': 8 },
  newPerSession: 10,
  workLimit: 30,
  practiceLimit: 20,
  requeueLimit: 10,
  requeuesPerItem: 2,
};
