import { createSignal } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { dayKey, emptyDaily } from '../domain/progress/queue';
import { parseProgress } from '../domain/progress/serialization';
import type { CharProgress, ProgressState } from '../domain/progress/types';
import { KEYS } from '../persistence/keys';
import { storage } from '../persistence/keyValue';

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

let loadBlocked = false;
/** True after a failed read: saving now would overwrite progress that may still be there. */
export const isLoadBlocked = () => loadBlocked;
export const setLoadBlocked = (blocked: boolean) => { loadBlocked = blocked; };

const [storageError, setStorageError] = createSignal<string | null>(null);
export { storageError, setStorageError };

/** The stored document, or null when there is none. Throws when storage or the data is unreadable. */
export const readStored = (): ProgressState | null => {
  const raw = storage.read(KEYS.progress);
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
export { state, setState };

export const serialize = (data: ProgressState) => JSON.stringify({ version: 3, chars: data.chars, daily: data.daily, words: data.words, wordDaily: data.wordDaily, activity: data.activity });

/** Writes `data` to storage. Throws when storage does, so callers decide what a failure means. */
export const writeStored = (data: ProgressState) => storage.write(KEYS.progress, serialize(data));

const ACTIVITY_DAYS = 120;

/** Counts one answer or first look today and drops days older than the calendar shows. */
export const logActivity = () => {
  const day = dayKey();
  const next: Record<string, number> = { ...state.activity, [day]: (state.activity[day] ?? 0) + 1 };
  const keep = Object.keys(next).sort().slice(-ACTIVITY_DAYS);
  setState('activity', reconcile(Object.fromEntries(keep.map((key) => [key, next[key]]))));
};

/**
 * Words missed in a session before their first graded answer. A word is enrolled when its recall
 * card is graded, so a miss on an earlier pick card would otherwise leave no trace and the word
 * would not show as flojo on Home. Kept in memory: it only has to last until that recall.
 */
export const missedBeforeEnrolment = new Set<string>();

export const save = (): boolean => {
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
