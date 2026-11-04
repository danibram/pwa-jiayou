import { createSignal } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { noteBefore, type ProgressCheckpoint, type RecordKind } from '../domain/progress/checkpoint';
import { dayKey, emptyDaily } from '../domain/progress/queue';
import { parseProgress } from '../domain/progress/serialization';
import type { CharProgress, ProgressState } from '../domain/progress/types';
import { KEYS } from '../persistence/keys';
import { deviceIdIn } from '../persistence/deviceId';
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
  lastReview: 0,
  updatedAt: 0,
  deviceId: '',
});

export const emptyState = (): ProgressState => ({ chars: {}, daily: emptyDaily(), words: {}, wordDaily: emptyDaily(), activity: {} });

export const serialize = (data: ProgressState) => JSON.stringify({ version: 4, chars: data.chars, daily: data.daily, words: data.words, wordDaily: data.wordDaily, activity: data.activity });

const ACTIVITY_DAYS = 120;

/**
 * Loads the document from `repo` right away, as the app needs it before the first render.
 * `deviceId` defaults to the one saved in `repo`; tests pass their own to act as two devices.
 */
export const createProgressState = (repo: KeyValueStore, options: { deviceId?: string } = {}) => {
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
  // Read after the document, so a failing first read is the document's and blocks overwriting it.
  const deviceId = options.deviceId ?? deviceIdIn(repo);

  /** Checkpoints of the session on screen. Each keeps the first value of every record written while it is open. */
  const openCheckpoints = new Set<ProgressCheckpoint>();

  /**
   * The one way to change a character or word record: an open checkpoint sees every change, and
   * every write is stamped with when and where it happened, for merging copies later.
   */
  const writeRecord = (kind: RecordKind, id: string, next: CharProgress) => {
    for (const checkpoint of openCheckpoints) noteBefore(checkpoint, kind, id, state[kind][id]);
    setState(kind, id, { ...next, updatedAt: Date.now(), deviceId });
  };

  /** Writes `data` to storage. Throws when storage does, so callers decide what a failure means. */
  const writeStored = (data: ProgressState) => repo.write(KEYS.progress, serialize(data));

  /**
   * Counts one answer or first look today in this device's log and drops days older than the
   * calendar shows. Other devices' logs are theirs to count.
   */
  const logActivity = () => {
    const day = dayKey();
    const own = state.activity[deviceId] ?? {};
    const next: Record<string, number> = { ...own, [day]: (own[day] ?? 0) + 1 };
    const keep = Object.keys(next).sort().slice(-ACTIVITY_DAYS);
    setState('activity', deviceId, reconcile(Object.fromEntries(keep.map((key) => [key, next[key]]))));
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
    deviceId,
    state,
    setState,
    storageError,
    setStorageError,
    /** True after a failed read: saving now would overwrite progress that may still be there. */
    isLoadBlocked: () => loadBlocked,
    setLoadBlocked: (blocked: boolean) => { loadBlocked = blocked; },
    readStored,
    writeStored,
    writeRecord,
    openCheckpoints,
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
