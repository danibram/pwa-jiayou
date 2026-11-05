import { createSignal } from 'solid-js';
import { topicById } from '../data/topics';
import { allWords, findWord } from '../data/vocabulary';
import { contentReferenceForCharacter, contentReferenceForWord } from '../domain/learning/content/revision';
import type { ItemContent, WordEntry } from '../domain/learning/exercises';
import {
  compareReplayOrder,
  createScheduler,
  DEFAULT_SCHEDULER_CONFIG,
  deviceLocalDayRule,
  effectiveItemEvents,
  isMastered,
  isWeak,
  pendingToday as isPendingToday,
  tomorrowLoad as countTomorrowLoad,
  tomorrowLoadFull as isTomorrowLoadFull,
  type LocalDayRule,
  type Scheduler,
} from '../domain/learning/scheduler';
import {
  buildSession,
  DEFAULT_SESSION_SETTINGS,
  itemKind,
  type ItemKind,
  type PoolItem,
  type SessionPlan,
  type SessionScope,
  type SessionSettings,
} from '../domain/learning/sessions';
import type {
  ContentReference,
  ItemId,
  LearningBackup as LearningBackupFile,
  LearningEvent,
  SchedulerConfig,
  SchedulerState,
  SessionMode,
  SessionState,
  Timestamp,
} from '../domain/learning/types';
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
import { deviceIdIn } from '../persistence/deviceId';
import { storage } from '../persistence/keyValue';
import { learningSettings } from '../persistence/learningSettings';
import { canSpeak } from '../utils/speech';
import { orderForLearning } from '../utils/wordOrder';
import { characterStore } from './characterStore';
import { vocabularyStore } from './vocabularyStore';

/**
 * How a screen shows an item:
 * - `new`: never taught;
 * - `learning`: taught and waiting for its first rating, or in a learning or relearning step;
 * - `review`: graduated, below the mastered stability;
 * - `weak`: a scheduled Again in the last 30 local days not yet followed by two passes (`isWeak`);
 * - `mastered`: FSRS stability of 21 days or more.
 * Weak wins over every other status, then mastered, review, learning and new.
 */
export type ItemStatus = 'new' | 'learning' | 'review' | 'weak' | 'mastered';

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
  /** The active session as stored. */
  loadSession(): Promise<SessionState | null>;
}

export const wordItemId = (wordId: string): ItemId => `word-meaning:${wordId}`;

export const contentReferenceOf = (content: ItemContent): ContentReference =>
  content.kind === 'word' ? contentReferenceForWord(content.word) : contentReferenceForCharacter(content.character);

const randomId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

const WORD_PREFIX = 'word-meaning:';

const defaultResolve = (itemId: ItemId): ItemContent | null => {
  if (!itemId.startsWith(WORD_PREFIX)) return null;
  const word = findWord(itemId.slice(WORD_PREFIX.length));
  return word ? { kind: 'word', word } : null;
};

/** A word's topic tags plus the theme of each subtopic, so a theme scope reaches its subtopics' words. */
const withThemes = (topicIds: readonly string[]): string[] => [
  ...new Set(topicIds.flatMap((id) => {
    const parent = topicById(id)?.parentId;
    return parent ? [id, parent] : [id];
  })),
];

const defaultPool = (resolve: (itemId: ItemId) => ItemContent | null) => (): PoolItem[] => {
  const words = orderForLearning(vocabularyStore.getSelectedWords(), characterStore.state.characters.map((row) => row.character));
  return words.map((word) => {
    const itemId = wordItemId(word.id);
    return { itemId, available: resolve(itemId) !== null, topicIds: withThemes(word.topicIds) };
  });
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

  const onChange = (change: LearningChange) => {
    if (change.kind === 'session') return;
    const work = change.kind === 'reset' ? reconnect() : reload();
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
    async loadSession() {
      return (await runtime!.repo.loadAll()).session;
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
    const state = states.get(itemId);
    const itemEvents = byItem.get(itemId) ?? [];
    const today = dayRule.localDay(clock());
    if (state && state.state !== 'new') {
      if (isWeak(itemEvents, itemId, today)) return 'weak';
      if (isMastered(state)) return 'mastered';
      return state.state === 'review' ? 'review' : 'learning';
    }
    if (state?.eligibleFrom) return 'learning';
    const taught = effectiveItemEvents(itemEvents, itemId).some((event) => event.type === 'exposure' && event.card.reason === 'teaching');
    return taught ? 'learning' : 'new';
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

    /** Items falling due in the next 24 hours, overdue ones excluded. */
    dueByTomorrow(kind: ItemKind = 'word-meaning'): number {
      version();
      return countTomorrowLoad(statesOf(kindPool(kind)), clock());
    },

    /** No new items while tomorrow's load reaches the limit. */
    tomorrowLoadFull(kind: ItemKind = 'word-meaning'): boolean {
      version();
      return isTomorrowLoadFull(statesOf(kindPool(kind)), clock());
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
      const voided = new Set(events.flatMap((event) => (event.type === 'attempt-voided' ? [event.targetEventId] : [])));
      const days: Record<string, number> = {};
      for (const event of events) {
        if (event.type === 'attempt-voided' || voided.has(event.id)) continue;
        days[event.localDay] = (days[event.localDay] ?? 0) + 1;
      }
      return days;
    },

    /** The stored active session, or null. Home offers to continue it. */
    async activeSession(): Promise<SessionState | null> {
      const active = await init();
      const session = await active.loadSession();
      return session && session.status === 'active' ? session : null;
    },

    /** The session settings in force now. */
    settings(): SessionSettings {
      return currentSettings();
    },

    /** The store's clock. */
    now(): Timestamp {
      return clock();
    },

    /** Every exposure and attempt of the item in replay order, each marked when a void cancels it. */
    history(itemId: ItemId): HistoryEntry[] {
      version();
      const own = byItem.get(itemId) ?? [];
      const voided = new Set(own.flatMap((event) => (event.type === 'attempt-voided' ? [event.targetEventId] : [])));
      return own
        .filter((event): event is HistoryEntry['event'] => event.type !== 'attempt-voided')
        .sort(compareReplayOrder)
        .map((event) => ({ event, voided: voided.has(event.id) }));
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

    /** The explicit development reset: deletes the learning database and opens an empty one. */
    async resetLearningData(): Promise<void> {
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
