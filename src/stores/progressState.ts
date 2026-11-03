import { createSignal } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { dayKey, emptyDaily } from '../domain/progress/queue';
import { parseProgress } from '../domain/progress/serialization';
import type { CharProgress, ProgressState } from '../domain/progress/types';
import { KEYS } from '../persistence/keys';
import { storage, type KeyValueStore } from '../persistence/keyValue';

/**
 * The progress document behind progressStore and vocabularyProgressStore. Characters and words
 * share one storage entry, one activity log and one checkpoint, so both stores write through here.
 */

export const emptyProgress = (): CharProgress => ({
  right: 0,
  wrong: 0,
  reps: 0,
  lapses: 0,
  interval: 0,
  ease: 2.5,
  due: 0,
  strokeRuns: 0,
  strokeBest: null,
  lastSeen: 0,
  clean: 0,
});

export const emptyState = (): ProgressState => ({ chars: {}, daily: emptyDaily(), words: {}, wordDaily: emptyDaily(), activity: {} });

export const serialize = (data: ProgressState) => JSON.stringify({ version: 3, chars: data.chars, daily: data.daily, words: data.words, wordDaily: data.wordDaily, activity: data.activity });

const ACTIVITY_DAYS = 120;

/** Loads the document from `repo` right away, as the app needs it before the first render. */
export const createProgressState = (repo: KeyValueStore) => {
  let loadBlocked = false;
  const [storageError, setStorageError] = createSignal<string | null>(null);

  /** The stored document, or null when there is none. Throws when storage or the data is unreadable. */
  const readStored = (): ProgressState | null => {
    const raw = repo.read(KEYS.progress);
    return raw === null ? null : parseProgress(raw);
  };

  const load = (): ProgressState => {
    try {
      return readStored() ?? emptyState();
    } catch {
      loadBlocked = true;
      setStorageError('No se pudo leer el progreso guardado. No se sobrescribirá.');
      return emptyState();
    }
  };

  const [state, setState] = createStore<ProgressState>(load());

  /** Writes `data` to storage. Throws when storage does, so callers decide what a failure means. */
  const writeStored = (data: ProgressState) => repo.write(KEYS.progress, serialize(data));

  /** Counts one answer or first look today and drops days older than the calendar shows. */
  const logActivity = () => {
    const day = dayKey();
    const next: Record<string, number> = { ...state.activity, [day]: (state.activity[day] ?? 0) + 1 };
    const keep = Object.keys(next).sort().slice(-ACTIVITY_DAYS);
    setState('activity', reconcile(Object.fromEntries(keep.map((key) => [key, next[key]]))));
  };

  const save = (): boolean => {
    if (loadBlocked) return false;
    try {
      writeStored(state);
      setStorageError(null);
      return true;
    } catch {
      setStorageError('No se pudo guardar el progreso. Exporta una copia y vuelve a intentarlo.');
      return false;
    }
  };

  return {
    state,
    setState,
    storageError,
    setStorageError,
    /** True after a failed read: saving now would overwrite progress that may still be there. */
    isLoadBlocked: () => loadBlocked,
    setLoadBlocked: (blocked: boolean) => { loadBlocked = blocked; },
    readStored,
    writeStored,
    logActivity,
    /**
     * Words missed in a session before their first graded answer. A word is enrolled when its recall
     * card is graded, so a miss on an earlier pick card would otherwise leave no trace and the word
     * would not show as flojo on Home. Kept in memory: it only has to last until that recall.
     */
    missedBeforeEnrolment: new Set<string>(),
    save,
  };
};

export type ProgressDocument = ReturnType<typeof createProgressState>;

/** The app's progress, in localStorage. */
export const progressDocument = createProgressState(storage);
