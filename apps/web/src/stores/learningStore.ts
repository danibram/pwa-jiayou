import { createSignal } from 'solid-js';
import { topicById, topics } from '../data/topics';
import { allWords, findWord } from '../data/vocabulary';
import { contentReferenceForCharacter, contentReferenceForWord } from '@jiayou/content';
import { characterItemId, characterOf, itemKind, wordIdOf, wordItemId } from '@jiayou/learning/items';
import type { ItemContent, WordEntry } from '@jiayou/learning/exercises';
import {
  compareReplayOrder,
  createScheduler,
  DEFAULT_SCHEDULER_CONFIG,
  deviceLocalDayRule,
  effectiveItemEvents,
  pendingToday as isPendingToday,
  tomorrowLoad as countTomorrowLoad,
  pendingTomorrow as countPendingTomorrow,
  tomorrowLoadFull as isTomorrowLoadFull,
  type LocalDayRule,
  type Scheduler,
  voidedEventIds,
} from '@jiayou/learning/scheduler';
import { activityByDay, itemStatus, type ItemStatus } from '@jiayou/learning/progress';
import {
  buildSession,
  DEFAULT_SESSION_SETTINGS,
  type ItemKind,
  type PoolItem,
  type SessionPlan,
  type SessionScope,
  type SessionSettings,
} from '@jiayou/learning/sessions';
import type {
  ContentReference,
  ItemId,
  LearningBackup as LearningBackupFile,
  LearningEvent,
  LocalDay,
  SchedulerConfig,
  SchedulerState,
  SessionMode,
  SessionState,
  Timestamp,
} from '@jiayou/learning/types';
import {
  createLearningRepository,
  isLearningStorageError,
  resetLearningData as deleteLearningDatabase,
  type ChannelLike,
  type CommitAnswerInput,
  type CommitResult,
  type ImportResult,
  type LearningChange,
  type LearningRepository,
  type LocksLike,
  type ReplaceResult,
  type VoidEvent,
  type VoidOptions,
  type VoidReason,
} from '../persistence/learning';
import { deviceIdIn, renewDeviceIdIn } from '../persistence/deviceId';
import { storage } from '../persistence/keyValue';
import { learningSettings } from '../persistence/learningSettings';
import { canSpeak } from '../utils/speech';
import { orderForLearning } from '../utils/wordOrder';
import type { HSKCharacter } from '../types';
import { characterStore } from './characterStore';
import { vocabularyStore } from './vocabularyStore';

export type { ItemStatus } from '@jiayou/learning/progress';

/** One entry of an item's history, as the word sheet lists it. Voids are folded into `voided`. */
export interface HistoryEntry {
  event: Exclude<LearningEvent, VoidEvent>;
  voided: boolean;
}

export interface LearningStoreOptions {
  /** Defaults to `globalThis.indexedDB`. */
  indexedDB?: IDBFactory;
  dbName?: string;
  /** Defaults to a `BroadcastChannel`; null turns cross-tab messages off. */
  channel?: ChannelLike | null;
  /** Defaults to `navigator.locks`; null turns locking off. */
  locks?: LocksLike | null;
  /** Defaults to the id the legacy progress already stamps (`deviceIdIn(storage)`). */
  deviceId?: () => string;
  /**
   * Gives the device a new id before the development reset deletes the log. Defaults to
   * `renewDeviceIdIn(storage)` when `deviceId` is not injected, and to nothing when it is.
   */
  renewDeviceId?: () => void;
  config?: SchedulerConfig;
  clock?: () => Timestamp;
  dayRule?: LocalDayRule;
  newId?: () => string;
  /** Read at each use, so a function lets changed study settings reach the next session. */
  settings?: SessionSettings | (() => SessionSettings);
  /** Whether speech synthesis can speak. Defaults to `canSpeak`. */
  speechAvailable?: () => boolean;
  /** The current content of an item, or null when its pack is not installed or it is retired. */
  resolveContent?: (itemId: ItemId) => ItemContent | null;
  /** The active pool in learning order. Defaults to the selected word lists. */
  pool?: () => readonly PoolItem[];
  /** Every word a learner could answer with, for distractors and ambiguity checks. */
  vocabulary?: () => readonly WordEntry[];
  /** Wraps or replaces the repository. Tests use it to fail a chosen write. */
  repository?: (create: () => LearningRepository) => LearningRepository;
}

/** What the session controller needs from an initialized store. */
export interface LearningRuntime {
  readonly repo: LearningRepository;
  readonly scheduler: Scheduler;
  readonly dayRule: LocalDayRule;
  readonly settings: SessionSettings;
  clock(): Timestamp;
  newId(): string;
  speechAvailable(): boolean;
  states(): ReadonlyMap<ItemId, SchedulerState>;
  events(): readonly LearningEvent[];
  itemEvents(itemId: ItemId): readonly LearningEvent[];
  contentFor(itemId: ItemId): ItemContent | null;
  pool(): PoolItem[];
  vocabulary(): readonly WordEntry[];
  /** Commits through the repository and folds the result into the store. */
  commit(input: CommitAnswerInput): Promise<CommitResult>;
  voidAttempt(targetEventId: string, reason: VoidReason, now: Timestamp, options?: VoidOptions): Promise<CommitResult<VoidEvent>>;
  /** The stored active session of `mode`, or null. */
  loadSession(mode: SessionMode): Promise<SessionState | null>;
}

export const contentReferenceOf = (content: ItemContent): ContentReference =>
  content.kind === 'word' ? contentReferenceForWord(content.word) : contentReferenceForCharacter(content.character);

const randomId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/** The installed catalog rows by character, rebuilt when a level is installed or removed. */
const characterRows = (() => {
  let built: { revision: number; count: number; rows: Map<string, HSKCharacter> } | null = null;
  return (): Map<string, HSKCharacter> => {
    const list = characterStore.state.characters;
    if (!built || built.revision !== characterStore.listRevision || built.count !== list.length) {
      built = { revision: characterStore.listRevision, count: list.length, rows: new Map(list.map((row) => [row.character, row])) };
    }
    return built.rows;
  };
})();

/**
 * A character resolves only to its catalog row, which `characterStore` already merged with its gloss
 * sidecar, so the content and its c1 revision are the ones Trazos shows and the published registry
 * holds. A character outside HSK has no row: the stub `characterOrWordStub` builds takes its gloss
 * from whichever studied word uses it, so it has no stable c1 and stays out of every session.
 */
const defaultResolve = (itemId: ItemId): ItemContent | null => {
  const wordId = wordIdOf(itemId);
  if (wordId !== null) {
    const word = findWord(wordId);
    return word ? { kind: 'word', word } : null;
  }
  const char = characterOf(itemId);
  if (char === null) return null;
  const row = characterRows().get(char);
  return row ? { kind: 'character', character: row } : null;
};

/** A word's topic tags plus the theme of each subtopic, so a theme scope reaches its subtopics' words. */
const withThemes = (topicIds: readonly string[]): string[] => [
  ...new Set(topicIds.flatMap((id) => {
    const parent = topicById(id)?.parentId;
    return parent ? [id, parent] : [id];
  })),
];

/** The topics that list a character, with their themes, as Trazos picks a topic's characters. */
const topicsByCharacter = (() => {
  let index: Map<string, string[]> | null = null;
  return (char: string): string[] => {
    if (!index) {
      const built = new Map<string, string[]>();
      for (const topic of topics) {
        for (const listed of topic.characters) built.set(listed, [...(built.get(listed) ?? []), topic.id]);
      }
      index = new Map([...built].map(([key, ids]) => [key, withThemes(ids)]));
    }
    return index.get(char) ?? [];
  };
})();

/**
 * Words of the selected lists, in learning order, then the characters of the selected levels in
 * catalog order. Trazos plans only the characters, every other mode only the words.
 */
const defaultPool = (resolve: (itemId: ItemId) => ItemContent | null) => (): PoolItem[] => {
  const words = orderForLearning(vocabularyStore.getSelectedWords(), characterStore.state.characters.map((row) => row.character));
  const wordItems = words.map((word) => {
    const itemId = wordItemId(word.id);
    return { itemId, available: resolve(itemId) !== null, topicIds: withThemes(word.topicIds) };
  });
  const characterItems = characterStore.getCharactersByLevel().map((row) => {
    const itemId = characterItemId(row.character);
    return { itemId, available: resolve(itemId) !== null, topicIds: topicsByCharacter(row.character) };
  });
  return [...wordItems, ...characterItems];
};

const groupByItem = (events: readonly LearningEvent[]): Map<ItemId, LearningEvent[]> => {
  const out = new Map<ItemId, LearningEvent[]>();
  for (const event of events) {
    const list = out.get(event.itemId);
    if (list) list.push(event);
    else out.set(event.itemId, [event]);
  }
  return out;
};

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The app-level learning store. Nothing touches IndexedDB until `init()`; the entry module must not
 * await it at the top level (the FSRS-7 model loads with a dynamic import). Read APIs are reactive:
 * they track one version signal that every load and write bumps.
 */
export const createLearningStore = (options: LearningStoreOptions = {}) => {
  const clock = options.clock ?? (() => Date.now());
  const dayRule = options.dayRule ?? deviceLocalDayRule;
  const newId = options.newId ?? randomId;
  const settingsOption = options.settings ?? DEFAULT_SESSION_SETTINGS;
  const currentSettings = (): SessionSettings => (typeof settingsOption === 'function' ? settingsOption() : settingsOption);
  const speechAvailable = options.speechAvailable ?? canSpeak;
  const resolveContent = options.resolveContent ?? defaultResolve;
  const pool = options.pool ?? defaultPool(resolveContent);
  const vocabulary = options.vocabulary ?? allWords;

  const [version, setVersion] = createSignal(0);
  const [ready, setReady] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const bump = () => setVersion((value) => value + 1);

  let scheduler: Scheduler | null = null;
  let repo: LearningRepository | null = null;
  let unsubscribe: (() => void) | null = null;
  let starting: Promise<LearningRuntime> | null = null;
  let runtime: LearningRuntime | null = null;

  let states = new Map<ItemId, SchedulerState>();
  let events: LearningEvent[] = [];
  let byItem = new Map<ItemId, LearningEvent[]>();
  const knownIds = new Set<string>();

  const setLog = (log: LearningEvent[]) => {
    events = log;
    byItem = groupByItem(log);
    knownIds.clear();
    for (const event of log) knownIds.add(event.id);
  };

  const addEvent = (event: LearningEvent) => {
    if (knownIds.has(event.id)) return;
    knownIds.add(event.id);
    events = [...events, event];
    const list = byItem.get(event.itemId);
    if (list) list.push(event);
    else byItem.set(event.itemId, [event]);
  };

  const reload = async (): Promise<void> => {
    if (!repo) return;
    const [loaded, log] = await Promise.all([repo.loadAll(), repo.listEvents()]);
    states = new Map(loaded.states);
    setLog(log);
    bump();
  };

  /** Session controllers listen here for writes from other tabs. */
  const listeners = new Set<(change: LearningChange) => void>();
  const notify = (change: LearningChange) => {
    for (const listener of [...listeners]) listener(change);
  };

  /**
   * Another tab wrote. A session draft needs no reload, a reset reconnects, and anything else reloads
   * the log before the listeners hear of it, so they read the new states.
   */
  const onChange = (change: LearningChange) => {
    if (change.kind === 'session') {
      notify(change);
      return;
    }
    if (change.kind === 'reset') notify(change);
    const work = change.kind === 'reset' ? reconnect() : reload().then(() => notify(change));
    work.catch((failure: unknown) => setError(messageOf(failure)));
  };

  const connect = async (): Promise<void> => {
    scheduler ??= await createScheduler(options.config ?? DEFAULT_SCHEDULER_CONFIG);
    const active = scheduler;
    const create = () =>
      createLearningRepository({
        indexedDB: options.indexedDB,
        dbName: options.dbName,
        scheduler: active,
        deviceId: (options.deviceId ?? (() => deviceIdIn(storage)))(),
        localDayRule: dayRule,
        channel: options.channel,
        locks: options.locks,
      });
    const opened = options.repository ? options.repository(create) : create();
    await opened.open();
    repo = opened;
    unsubscribe = opened.onExternalChange(onChange);
    await reload();
  };

  const disconnect = () => {
    unsubscribe?.();
    unsubscribe = null;
    repo?.close();
    repo = null;
  };

  /** After a reset in another tab the connection is gone: open a fresh one. */
  const reconnect = async (): Promise<void> => {
    disconnect();
    states = new Map();
    setLog([]);
    bump();
    await connect();
  };

  const contentFor = (itemId: ItemId): ItemContent | null => resolveContent(itemId);

  const makeRuntime = (): LearningRuntime => ({
    get repo() {
      if (!repo) throw new Error('The learning store is not initialized');
      return repo;
    },
    get scheduler() {
      if (!scheduler) throw new Error('The learning store is not initialized');
      return scheduler;
    },
    dayRule,
    get settings() {
      return currentSettings();
    },
    clock,
    newId,
    speechAvailable,
    states: () => states,
    events: () => events,
    itemEvents: (itemId) => byItem.get(itemId) ?? [],
    contentFor,
    pool: () => [...pool()],
    vocabulary,
    async commit(input) {
      const result = await runtime!.repo.commitAnswer(input);
      addEvent(result.event);
      if (result.state) states.set(result.state.itemId, result.state);
      bump();
      return result;
    },
    async voidAttempt(targetEventId, reason, now, voidOptions) {
      const result = await runtime!.repo.voidAttempt(targetEventId, reason, now, voidOptions);
      addEvent(result.event);
      if (result.state) states.set(result.state.itemId, result.state);
      bump();
      return result;
    },
    loadSession(mode) {
      return runtime!.repo.loadSession(mode);
    },
  });

  /** Opens the database, loads the log and starts listening to other tabs. Safe to call repeatedly. */
  const init = (): Promise<LearningRuntime> => {
    starting ??= connect()
      .then(() => {
        runtime ??= makeRuntime();
        setError(null);
        setReady(true);
        return runtime;
      })
      .catch((failure: unknown) => {
        starting = null;
        disconnect();
        setError(messageOf(failure));
        throw failure;
      });
    return starting;
  };

  const kindPool = (kind: ItemKind) => pool().filter((item) => item.available && itemKind(item.itemId) === kind);

  const firstTeachingDay = (itemId: ItemId) => {
    const first = effectiveItemEvents(byItem.get(itemId) ?? [], itemId).find(
      (event) => event.type === 'exposure' && event.card.reason === 'teaching',
    );
    return first ? first.localDay : null;
  };

  const status = (itemId: ItemId): ItemStatus => {
    version();
    return itemStatus(itemId, states.get(itemId), byItem.get(itemId) ?? [], dayRule.localDay(clock()));
  };

  const statesOf = (items: readonly PoolItem[]) =>
    items.flatMap((item) => {
      const state = states.get(item.itemId);
      return state ? [state] : [];
    });

  return {
    init,
    /** Throws if `init()` has not resolved. */
    runtime(): LearningRuntime {
      if (!runtime || !repo) throw new Error('The learning store is not initialized');
      return runtime;
    },
    ready,
    /** The last load or sync failure, or null. */
    error,
    /** Re-reads states and the log, as another tab's write does. */
    reload,

    status(itemId: ItemId): ItemStatus {
      return status(itemId);
    },

    state(itemId: ItemId): SchedulerState | null {
      version();
      return states.get(itemId) ?? null;
    },

    /** Items of the pool Hoy shows as pending: the rule that also lets a meaning card rate. */
    pendingToday(kind: ItemKind = 'word-meaning'): number {
      version();
      const now = clock();
      return statesOf(kindPool(kind)).filter((state) => isPendingToday(state, now, dayRule)).length;
    },

    /**
     * New items the daily budget still allows, counting first teaching exposures with today's local
     * day. `today` uses Hoy's own share; any other mode the whole daily cap.
     */
    newLeftToday(mode: 'today' | 'other' = 'today', kind: ItemKind = 'word-meaning'): number {
      version();
      const today = dayRule.localDay(clock());
      let taught = 0;
      for (const itemId of byItem.keys()) if (itemKind(itemId) === kind && firstTeachingDay(itemId) === today) taught += 1;
      const settings = currentSettings();
      const cap = mode === 'today' ? Math.min(settings.todayNewPerDay[kind], settings.newPerDay[kind]) : settings.newPerDay[kind];
      return Math.max(0, cap - taught);
    },

    /**
     * Tomorrow's load (`tomorrowLoad`): items falling due in the next 24 hours, overdue ones excluded,
     * and items taught today whose first rating opens tomorrow. The gate on new items reads it.
     */
    dueByTomorrow(kind: ItemKind = 'word-meaning'): number {
      version();
      return countTomorrowLoad(statesOf(kindPool(kind)), clock(), dayRule);
    },

    /** What Hoy will hold tomorrow if nothing more is studied today (`pendingTomorrow`). */
    pendingTomorrow(kind: ItemKind = 'word-meaning'): number {
      version();
      return countPendingTomorrow(statesOf(kindPool(kind)), clock(), dayRule);
    },

    /** No new items while tomorrow's load reaches the limit. */
    tomorrowLoadFull(kind: ItemKind = 'word-meaning'): boolean {
      version();
      return isTomorrowLoadFull(statesOf(kindPool(kind)), clock(), dayRule);
    },

    /** Whether Hoy shows the item as pending today. */
    isPendingToday(itemId: ItemId): boolean {
      version();
      const state = states.get(itemId);
      return state !== undefined && isPendingToday(state, clock(), dayRule);
    },

    /**
     * The plan a session of this mode and scope would start with now, without saving anything. Screens
     * read their counts from it so they say what the session will do. Null before `init()`.
     */
    previewPlan(mode: SessionMode, scope: SessionScope = { kind: 'all' }): SessionPlan | null {
      version();
      if (!ready()) return null;
      return buildSession({ mode, scope, pool: pool(), states, events, now: clock(), dayRule, settings: currentSettings() });
    },

    /** The whole log, as loaded and written so far. */
    events(): readonly LearningEvent[] {
      version();
      return events;
    },

    /** Exposures and attempts per local day, voided ones left out, for the activity calendar. */
    activityByDay(): Record<string, number> {
      version();
      return activityByDay(events);
    },

    /** The stored active session of `mode`, or null. */
    async activeSession(mode: SessionMode): Promise<SessionState | null> {
      const active = await init();
      return active.loadSession(mode);
    },

    /** Every stored active session, one per mode at most, the most recently started first. */
    async activeSessions(): Promise<SessionState[]> {
      const { repo: active } = await init();
      const { sessions } = await active.loadAll();
      return [...sessions.values()].sort((a, b) => b.startedAt - a.startedAt);
    },

    /** The session settings in force now. */
    settings(): SessionSettings {
      return currentSettings();
    },

    /** The store's clock. */
    now(): Timestamp {
      return clock();
    },

    /** The local day by the store's clock and day rule, the day every count and budget uses. */
    today(): LocalDay {
      return dayRule.localDay(clock());
    },

    /** The store's day rule. */
    dayRule(): LocalDayRule {
      return dayRule;
    },

    /** Calls `callback` after another tab's write lands in this store. Returns the unsubscribe. */
    onExternalChange(callback: (change: LearningChange) => void): () => void {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },

    /** Every exposure and attempt of the item in replay order, each marked when a void cancels it. */
    history(itemId: ItemId): HistoryEntry[] {
      version();
      const own = byItem.get(itemId) ?? [];
      const voided = voidedEventIds(own);
      return own
        .filter((event): event is HistoryEntry['event'] => event.type !== 'attempt-voided')
        .sort(compareReplayOrder)
        .map((event) => ({ event, voided: voided.has(event.id) }));
    },

    /** Whether the active pool holds the item with its content available, so a session can plan it. */
    inPool(itemId: ItemId): boolean {
      return pool().some((item) => item.itemId === itemId && item.available);
    },

    /** The item's current content, or null when its pack is not installed. */
    content(itemId: ItemId): ItemContent | null {
      return contentFor(itemId);
    },

    /** The whole log and every config, as a backup file holds them. */
    async exportBackup(): Promise<LearningBackupFile> {
      const { repo: active } = await init();
      return active.exportAll(clock());
    },

    /** Adds the backup's events by id and rebuilds what they touch. An invalid backup changes nothing. */
    async mergeBackup(backup: LearningBackupFile): Promise<ImportResult> {
      const { repo: active } = await init();
      const result = await active.importEvents(backup.events, backup.configs);
      await reload();
      return result;
    },

    /** Replaces the whole log with the backup. Explicit and destructive. */
    async replaceBackup(backup: LearningBackupFile): Promise<ReplaceResult> {
      const { repo: active } = await init();
      const result = await active.replaceAll(backup);
      await reload();
      return result;
    },

    /**
     * The explicit development reset: deletes the learning database and opens an empty one. The
     * device gets a new id first, so the restarted `sequence` never repeats a (deviceId, sequence)
     * pair of the old log, which an old backup may still bring back. It changes before the delete
     * because other tabs reopen the database as soon as they hear of the reset.
     */
    async resetLearningData(): Promise<void> {
      (options.renewDeviceId ?? (options.deviceId ? () => {} : () => void renewDeviceIdIn(storage)))();
      disconnect();
      states = new Map();
      setLog([]);
      bump();
      try {
        await deleteLearningDatabase({ indexedDB: options.indexedDB, dbName: options.dbName, channel: options.channel });
      } finally {
        starting = null;
        setReady(false);
      }
      await init();
    },

    /** Closes the connection. A later `init()` opens it again. */
    close() {
      listeners.clear();
      disconnect();
      starting = null;
      setReady(false);
    },
  };
};

export type LearningStore = ReturnType<typeof createLearningStore>;

/** The app's instance. Call `learningStore.init()` from an async startup path. */
export const learningStore = createLearningStore({ settings: learningSettings.sessionSettings });

export { isLearningStorageError };
