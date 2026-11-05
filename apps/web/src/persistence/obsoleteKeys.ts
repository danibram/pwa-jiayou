import type { KeyValueStore } from './keyValue';

/**
 * localStorage keys that older builds wrote and nothing reads any more. The learning log in IndexedDB
 * replaced the progress and session keys, and their data is not migrated (there are no users yet).
 */
const OBSOLETE_KEYS = [
  /** Character and word progress, daily counts and activity of the v4 system. */
  'hsk-flashcards-stats',
  /** The review session of the builds before the word sessions. */
  'jiayou-session-v1',
  /** Gesture hints of an older Home. */
  'hsk-gesture-hint-views',
] as const;

const OBSOLETE_PREFIXES = [
  /** Today's word session and, with `:practice:<id>`, each practice session of the v4 system. */
  'jiayou-vocabulary-session-v1',
  /** Per-screen hint counters of an older Home. */
  'hsk-hint-',
] as const;

/**
 * Removes the obsolete keys. Runs at every start and does nothing once they are gone. A storage
 * failure is ignored: the keys only waste space.
 */
export const removeObsoleteKeys = (store: KeyValueStore): void => {
  try {
    const keys = [...OBSOLETE_KEYS, ...OBSOLETE_PREFIXES.flatMap((prefix) => store.keys(prefix))];
    for (const key of keys) store.remove(key);
  } catch {
    // Unreadable storage: try again next start.
  }
};
