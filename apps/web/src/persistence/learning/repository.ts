import { highestSequence, planMerge, planReplace, type BackupError, type LearningLog } from '@jiayou/learning/backup';
import {
  canonicalJson,
  compareReplayOrder,
  createSchedulerRegistry,
  deviceLocalDayRule,
  rebuildItem,
  type Scheduler,
} from '@jiayou/learning/scheduler';
import type {
  ConfigId,
  ItemId,
  LearningBackup,
  LearningEvent,
  SchedulerState,
  SessionMode,
  SessionState,
  StoredSchedulerConfig,
} from '@jiayou/learning/types';
import { LearningStorageError, rejected, toStorageError } from './errors';
import { deleteDatabase, openDatabase, request, transaction } from './idb';
import { EVENT_INDEXES, LEARNING_DB_NAME, LEARNING_DB_VERSION, META, STORES } from './schema';
import type {
  ChannelLike,
  CommitResult,
  EventQuery,
  LearningChange,
  LearningChangedMessage,
  LearningRepository,
  LearningRepositoryOptions,
  LocksLike,
  VoidEvent,
} from './types';
import { assertValidEvent, isAttemptEvent, parseLog, sameIgnoringSequence } from './validate';

export const LEARNING_CHANNEL_NAME = 'jiayou-learning';
export const LEARNING_LOCK_NAME = 'jiayou-learning-write';

const randomId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

const defaultChannel = (): ChannelLike | null =>
  typeof BroadcastChannel === 'function' ? new BroadcastChannel(LEARNING_CHANNEL_NAME) : null;

const defaultLocks = (): LocksLike | null => {
  const locks = (globalThis as { navigator?: { locks?: unknown } }).navigator?.locks;
  return locks && typeof (locks as LocksLike).request === 'function' ? (locks as LocksLike) : null;
};

const ALL_STORES = [STORES.events, STORES.schedulerStates, STORES.configs, STORES.sessions, STORES.meta] as const;

/** The next `sequence` this device will write. The first event of a device gets 0. */
const readSequence = async (meta: IDBObjectStore): Promise<number> => {
  const value: unknown = await request(meta.get(META.sequence));
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 0;
};

const groupByItem = (events: readonly LearningEvent[]): Map<ItemId, LearningEvent[]> => {
  const groups = new Map<ItemId, LearningEvent[]>();
  for (const event of events) {
    const group = groups.get(event.itemId);
    if (group) group.push(event);
    else groups.set(event.itemId, [event]);
  }
  return groups;
};

const invalidBackup = (errors: readonly BackupError[]): LearningStorageError =>
  rejected('invalid-backup', errors.map((error) => error.message).join(' '), { eventId: errors[0]?.eventId, backupErrors: errors });

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

const assertSession = (session: SessionState): void => {
  if (!isRecord(session) || session.schemaVersion !== 1 || typeof session.id !== 'string' || session.id === '') {
    throw rejected('invalid-input', 'A session needs schemaVersion 1 and an id');
  }
};

const assertState = (state: SchedulerState, itemId: ItemId): void => {
  if (!isRecord(state) || state.schemaVersion !== 1 || state.itemId !== itemId) {
    throw rejected('invalid-input', `The next state must be a schemaVersion 1 state of ${itemId}`);
  }
};

/**
 * Keeps one session per mode: writing one drops every other session of its mode, so pausing Hoy and
 * opening Trazos leaves both. The store holds a handful of rows, so a scan beats an index.
 *
 * A write never moves a stored session back unless `rewind` says so (undo does): a tab that has not
 * yet heard of another tab's answer must not put the session back on the card already answered.
 */
const putSession = async (tx: IDBTransaction, session: SessionState, rewind = false): Promise<void> => {
  const store = tx.objectStore(STORES.sessions);
  const stored = (await request(store.getAll())) as SessionState[];
  const same = stored.find((other) => other.id === session.id);
  if (same && !rewind && same.position > session.position) return;
  for (const other of stored) if (other.mode === session.mode && other.id !== session.id) store.delete(other.id);
  store.put(session);
};

/** The active session of each mode. */
const activeByMode = (sessions: readonly SessionState[]): Map<SessionMode, SessionState> => {
  const out = new Map<SessionMode, SessionState>();
  for (const session of sessions) if (session.status === 'active') out.set(session.mode, session);
  return out;
};

/**
 * The IndexedDB learning repository. The event log is the source of truth; each item's
 * `SchedulerState` is a cache rebuilt from it. Every write runs in one readwrite transaction under
 * `navigator.locks` and announces itself on a `BroadcastChannel` once committed.
 *
 * Without `navigator.locks` (old browsers, tests) writes are not serialized across tabs beyond what
 * IndexedDB itself does. IndexedDB already runs overlapping readwrite transactions one at a time, so
 * the sequence counter and the duplicate checks stay correct; only the config registry refresh
 * before a void or import could race an import in another tab, and then the rebuild fails with a
 * retryable error instead of guessing.
 */
export const createLearningRepository = (options: LearningRepositoryOptions): LearningRepository => {
  const factory = options.indexedDB ?? (typeof indexedDB === 'undefined' ? undefined : indexedDB);
  const dbName = options.dbName ?? LEARNING_DB_NAME;
  const scheduler = options.scheduler;
  const dayRule = options.localDayRule ?? deviceLocalDayRule;
  const newId = options.newId ?? randomId;
  const locks = options.locks === undefined ? defaultLocks() : options.locks;
  const ownsChannel = options.channel === undefined;
  const channel = ownsChannel ? defaultChannel() : options.channel;
  /** Tells this instance's messages apart if a channel echoes them back. */
  const source = randomId();
  /** One scheduler per known config, so a rebuild inside a transaction never awaits. */
  const registry = new Map<ConfigId, Scheduler>([[scheduler.configId, scheduler]]);
  const listeners = new Set<(change: LearningChange) => void>();
  let db: IDBDatabase | null = null;
  let deviceId = '';

  const onMessage = (event: MessageEvent) => {
    const data: unknown = event.data;
    if (!isRecord(data) || data.type !== 'learning-changed' || data.source === source) return;
    const change = (data as unknown as LearningChangedMessage).change;
    for (const listener of [...listeners]) listener(change);
  };
  channel?.addEventListener('message', onMessage);

  const database = (): IDBDatabase => {
    if (!db) throw new LearningStorageError({ kind: 'unavailable', message: 'The learning database is not open' });
    return db;
  };

  const announce = (change: LearningChange) => {
    const message: LearningChangedMessage = { type: 'learning-changed', source, change };
    try {
      channel?.postMessage(message);
    } catch {
      // A closed channel only means other tabs reload later.
    }
  };

  /** Runs a write under the lock, maps its failure, and announces it after the commit. */
  const write = async <T>(run: () => Promise<T>, change: (result: T) => LearningChange | null): Promise<T> => {
    let result: T;
    try {
      result = locks ? await locks.request(LEARNING_LOCK_NAME, run) : await run();
    } catch (error) {
      throw toStorageError(error);
    }
    const message = change(result);
    if (message) announce(message);
    return result;
  };

  const read = async <T>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      throw toStorageError(error);
    }
  };

  /**
   * Creates schedulers for configs the registry lacks. A config whose id is known with another
   * content is refused. Async, so it runs before the transaction that needs it.
   */
  const addSchedulers = async (configs: readonly StoredSchedulerConfig[]): Promise<void> => {
    const fresh: StoredSchedulerConfig[] = [];
    for (const stored of configs) {
      const known = registry.get(stored.id);
      if (!known) fresh.push(stored);
      else if (canonicalJson(known.config) !== canonicalJson(stored.config)) {
        throw rejected('invalid-config', `Two configs stored as ${stored.id}`);
      }
    }
    if (fresh.length === 0) return;
    for (const [id, created] of await createSchedulerRegistry(fresh)) registry.set(id, created);
  };

  /** Picks up configs another tab imported since this instance opened. */
  const syncRegistry = async (): Promise<void> => {
    const stored = await transaction(database(), [STORES.configs], 'readonly', (tx) =>
      request(tx.objectStore(STORES.configs).getAll() as IDBRequest<StoredSchedulerConfig[]>),
    );
    await addSchedulers(stored);
  };

  const rebuild = (events: readonly LearningEvent[], itemId: ItemId): SchedulerState => rebuildItem(events, itemId, scheduler, registry);

  const readLog = (): Promise<LearningLog> =>
    transaction(database(), [STORES.events, STORES.configs], 'readonly', async (tx) => ({
      events: (await request(tx.objectStore(STORES.events).getAll())) as LearningEvent[],
      configs: (await request(tx.objectStore(STORES.configs).getAll())) as StoredSchedulerConfig[],
    }));

  /**
   * The log only grows between replaces, so an equal count means the snapshot a plan was made on is
   * still the log. Without `navigator.locks` another tab may have written in between: fail as
   * retryable rather than write a plan checked against an older log.
   */
  const assertUnchanged = async (events: IDBObjectStore, snapshot: LearningLog): Promise<void> => {
    if ((await request(events.count())) !== snapshot.events.length) {
      throw new LearningStorageError({ kind: 'aborted', message: 'The log changed while the import was planned; retry' });
    }
  };

  const repository: LearningRepository = {
    get deviceId() {
      return deviceId;
    },

    async open() {
      if (db) return;
      try {
        if (!factory) throw new LearningStorageError({ kind: 'unavailable', message: 'IndexedDB is not available' });
        const opened = await openDatabase(factory, dbName);
        // A reset or a newer version in another tab: let it proceed; later calls report `unavailable`.
        opened.onversionchange = () => {
          opened.close();
          if (db === opened) db = null;
        };
        db = opened;
        await transaction(opened, [STORES.meta, STORES.configs, STORES.events], 'readwrite', async (tx) => {
          const meta = tx.objectStore(STORES.meta);
          const storedId: unknown = await request(meta.get(META.deviceId));
          deviceId = typeof storedId === 'string' && storedId !== '' ? storedId : (options.deviceId ?? randomId());
          if (storedId !== deviceId) meta.put(deviceId, META.deviceId);
          meta.put(LEARNING_DB_VERSION, META.schemaVersion);
          const own = (await request(tx.objectStore(STORES.events).index(EVENT_INDEXES.deviceId).getAll(deviceId))) as LearningEvent[];
          const next = highestSequence(own, deviceId) + 1;
          if (next > (await readSequence(meta))) meta.put(next, META.sequence);
          const configs = tx.objectStore(STORES.configs);
          if (!(await request(configs.get(scheduler.configId)))) {
            configs.put({ id: scheduler.configId, config: scheduler.config } satisfies StoredSchedulerConfig);
          }
        });
        await syncRegistry();
      } catch (error) {
        // Leave the repository closed so a retry of open() starts over.
        db?.close();
        db = null;
        throw toStorageError(error);
      }
    },

    close() {
      db?.close();
      db = null;
      channel?.removeEventListener('message', onMessage);
      // An injected channel belongs to the caller.
      if (ownsChannel) channel?.close();
      listeners.clear();
    },

    loadAll() {
      return read(() =>
        transaction(database(), [STORES.schedulerStates, STORES.sessions, STORES.configs], 'readonly', async (tx) => {
          const states = (await request(tx.objectStore(STORES.schedulerStates).getAll())) as SchedulerState[];
          const sessions = (await request(tx.objectStore(STORES.sessions).getAll())) as SessionState[];
          const configs = (await request(tx.objectStore(STORES.configs).getAll())) as StoredSchedulerConfig[];
          return {
            deviceId,
            states: new Map(states.map((state) => [state.itemId, state])),
            sessions: activeByMode(sessions),
            configs,
          };
        }),
      );
    },

    loadSession(mode) {
      return read(() =>
        transaction(database(), [STORES.sessions], 'readonly', async (tx) => {
          const sessions = (await request(tx.objectStore(STORES.sessions).getAll())) as SessionState[];
          return activeByMode(sessions).get(mode) ?? null;
        }),
      );
    },

    listEvents(query?: EventQuery) {
      return read(() =>
        transaction(database(), [STORES.events], 'readonly', async (tx) => {
          const store = tx.objectStore(STORES.events);
          let req: IDBRequest<unknown[]>;
          if (!query) req = store.getAll();
          else if ('itemId' in query) req = store.index(EVENT_INDEXES.itemId).getAll(query.itemId);
          else if ('localDay' in query) req = store.index(EVENT_INDEXES.localDay).getAll(query.localDay);
          else req = store.index(EVENT_INDEXES.sessionId).getAll(query.sessionId);
          return ((await request(req)) as LearningEvent[]).sort(compareReplayOrder);
        }),
      );
    },

    async commitAnswer({ event: pending, nextState, session, basedOn, sessionPosition }) {
      let stamped: LearningEvent;
      try {
        if (!isRecord(pending)) throw rejected('invalid-event', 'An event must be an object');
        if ((pending as { type?: unknown }).type === 'attempt-voided') throw rejected('invalid-event', 'Write voids with voidAttempt');
        database();
        stamped = { ...pending, deviceId, sequence: 0 } as LearningEvent;
        assertValidEvent(stamped, deviceId);
        if (session) assertSession(session);
        if (nextState && typeof nextState !== 'function') assertState(nextState, stamped.itemId);
      } catch (error) {
        throw toStorageError(error);
      }
      return write(
        () =>
          transaction(database(), [STORES.events, STORES.schedulerStates, STORES.sessions, STORES.meta], 'readwrite', async (tx) => {
            const events = tx.objectStore(STORES.events);
            const states = tx.objectStore(STORES.schedulerStates);
            const stored = (await request(events.get(stamped.id))) as LearningEvent | undefined;
            if (stored) {
              if (!sameIgnoringSequence(stored, stamped)) {
                throw rejected('conflicting-event', `Event ${stamped.id} is already stored with another content`, { eventId: stamped.id });
              }
              const state = ((await request(states.get(stored.itemId))) as SchedulerState | undefined) ?? null;
              return { event: stored, state, duplicate: true };
            }
            if (isAttemptEvent(stamped)) {
              const other = (await request(events.index(EVENT_INDEXES.attemptId).get(stamped.attemptId))) as LearningEvent | undefined;
              if (other) {
                throw rejected('duplicate-attempt', `Attempt ${stamped.attemptId} already has event ${other.id}`, { eventId: stamped.id });
              }
            }
            const current = ((await request(states.get(stamped.itemId))) as SchedulerState | undefined) ?? null;
            if (basedOn !== undefined && canonicalJson(current) !== canonicalJson(basedOn)) {
              throw new LearningStorageError({
                kind: 'stale-state',
                itemId: stamped.itemId,
                message: `The state of ${stamped.itemId} changed since the answer was evaluated`,
              });
            }
            if (session && sessionPosition !== undefined) {
              // A practice answer may leave the item's state as it was, so the session's own position
              // is what tells a second tab that this card was already answered.
              const storedSession = (await request(tx.objectStore(STORES.sessions).get(session.id))) as SessionState | undefined;
              if (storedSession && storedSession.position !== sessionPosition) {
                throw new LearningStorageError({
                  kind: 'stale-state',
                  itemId: stamped.itemId,
                  message: `Session ${session.id} moved to card ${storedSession.position} while this tab answered card ${sessionPosition}`,
                });
              }
            }
            const meta = tx.objectStore(STORES.meta);
            const sequence = await readSequence(meta);
            const event = { ...stamped, sequence } as LearningEvent;
            meta.put(sequence + 1, META.sequence);
            events.add(event);
            const next = typeof nextState === 'function' ? nextState(current) : nextState;
            if (next) {
              assertState(next, event.itemId);
              states.put(next);
            }
            if (session) await putSession(tx, session);
            return { event, state: next ?? current, duplicate: false } satisfies CommitResult;
          }),
        (result) => (result.duplicate ? null : { kind: 'commit', itemIds: [result.event.itemId] }),
      );
    },

    async saveAttemptDraft(session, draftOptions = {}) {
      try {
        assertSession(session);
      } catch (error) {
        throw toStorageError(error);
      }
      await write(
        () => transaction(database(), [STORES.sessions], 'readwrite', (tx) => putSession(tx, session, draftOptions.rewind === true)),
        () => ({ kind: 'session', itemIds: [] }),
      );
    },

    voidAttempt(targetEventId, reason, now, voidOptions = {}) {
      return write(
        async () => {
          if (!Number.isFinite(now) || now <= 0) throw rejected('invalid-input', `Invalid void time ${now}`);
          await syncRegistry();
          return transaction(database(), [STORES.events, STORES.schedulerStates, STORES.meta], 'readwrite', async (tx) => {
            const events = tx.objectStore(STORES.events);
            const states = tx.objectStore(STORES.schedulerStates);
            const target = (await request(events.get(targetEventId))) as LearningEvent | undefined;
            if (!target) throw rejected('invalid-void', `No event ${targetEventId} to void`, { eventId: targetEventId });
            if (!isAttemptEvent(target)) {
              throw rejected('invalid-void', `A ${target.type} cannot be voided`, { eventId: targetEventId });
            }
            const itemEvents = (await request(events.index(EVENT_INDEXES.itemId).getAll(target.itemId))) as LearningEvent[];
            const current = ((await request(states.get(target.itemId))) as SchedulerState | undefined) ?? null;
            if (voidOptions.id !== undefined) {
              const stored = (await request(events.get(voidOptions.id))) as LearningEvent | undefined;
              if (stored) {
                if (stored.type === 'attempt-voided' && stored.targetEventId === targetEventId) {
                  return { event: stored, state: current, duplicate: true };
                }
                throw rejected('conflicting-event', `Event ${voidOptions.id} is already stored with another content`, {
                  eventId: voidOptions.id,
                });
              }
            }
            // Voiding twice has the effect of voiding once, so the earlier void stands.
            const earlier = itemEvents.find((event): event is VoidEvent => event.type === 'attempt-voided' && event.targetEventId === targetEventId);
            if (earlier) return { event: earlier, state: current, duplicate: true };

            const meta = tx.objectStore(STORES.meta);
            const sequence = await readSequence(meta);
            const event: VoidEvent = {
              schemaVersion: 1,
              id: voidOptions.id ?? newId(),
              sessionId: voidOptions.sessionId ?? target.sessionId,
              sessionMode: voidOptions.sessionMode ?? target.sessionMode,
              deviceId,
              sequence,
              occurredAt: now,
              localDay: dayRule.localDay(now),
              type: 'attempt-voided',
              itemId: target.itemId,
              targetEventId,
              reason,
            };
            meta.put(sequence + 1, META.sequence);
            events.add(event);
            const state = rebuild([...itemEvents, event], target.itemId);
            states.put(state);
            return { event, state, duplicate: false } satisfies CommitResult<VoidEvent>;
          });
        },
        (result) => (result.duplicate ? null : { kind: 'void', itemIds: [result.event.itemId] }),
      );
    },

    importEvents(incoming, configs) {
      return write(
        async () => {
          const incomingLog = parseLog({ deviceId, events: incoming, configs });
          // The plan is async (config hashes), so it runs on a snapshot before the write transaction.
          const current = await readLog();
          const planned = await planMerge(current, incomingLog);
          if (!planned.ok) throw invalidBackup(planned.error);
          const plan = planned.value;
          if (plan.newEvents.length === 0 && plan.newConfigs.length === 0) return { added: 0, rebuilt: [], addedConfigs: [] };
          await syncRegistry();
          await addSchedulers(plan.newConfigs);
          // Pure and synchronous, so it can run before the transaction as well.
          const byItem = groupByItem(plan.events);
          const rebuilt = plan.itemsToRebuild.map((itemId) => rebuild(byItem.get(itemId) ?? [], itemId));
          return transaction(database(), [STORES.events, STORES.schedulerStates, STORES.configs, STORES.meta], 'readwrite', async (tx) => {
            const events = tx.objectStore(STORES.events);
            await assertUnchanged(events, current);
            const configStore = tx.objectStore(STORES.configs);
            for (const config of plan.newConfigs) configStore.put(config);
            for (const event of plan.newEvents) events.add(event);
            const states = tx.objectStore(STORES.schedulerStates);
            for (const state of rebuilt) states.put(state);
            const meta = tx.objectStore(STORES.meta);
            const next = highestSequence(plan.newEvents, deviceId) + 1;
            if (next > (await readSequence(meta))) meta.put(next, META.sequence);
            return { added: plan.newEvents.length, rebuilt: plan.itemsToRebuild, addedConfigs: plan.newConfigs.map((config) => config.id) };
          });
        },
        (result) => (result.added > 0 || result.addedConfigs.length > 0 ? { kind: 'import', itemIds: result.rebuilt } : null),
      );
    },

    replaceAll(backup: LearningBackup) {
      return write(
        async () => {
          if (!isRecord(backup) || backup.schemaVersion !== 1) throw rejected('invalid-backup', 'Not a schemaVersion 1 learning backup');
          const incomingLog = parseLog({ deviceId: backup.deviceId, events: backup.events, configs: backup.configs });
          const planned = await planReplace(incomingLog);
          if (!planned.ok) throw invalidBackup(planned.error);
          const plan = planned.value;
          await addSchedulers(plan.configs);
          // planReplace keeps only the backup's configs; the installed one must stay stored.
          const current: StoredSchedulerConfig = { id: scheduler.configId, config: scheduler.config };
          const kept = plan.configs.some((config) => config.id === current.id) ? plan.configs : [...plan.configs, current];
          const byItem = groupByItem(plan.events);
          const rebuiltStates = plan.itemsToRebuild.map((itemId) => rebuild(byItem.get(itemId) ?? [], itemId));
          const next = highestSequence(plan.events, deviceId) + 1;

          return transaction(database(), ALL_STORES, 'readwrite', async (tx) => {
            const meta = tx.objectStore(STORES.meta);
            const sequence = Math.max(await readSequence(meta), next);
            for (const name of [STORES.events, STORES.schedulerStates, STORES.configs, STORES.sessions]) tx.objectStore(name).clear();
            const configStore = tx.objectStore(STORES.configs);
            for (const config of kept) configStore.put(config);
            const events = tx.objectStore(STORES.events);
            for (const event of plan.events) events.add(event);
            const states = tx.objectStore(STORES.schedulerStates);
            for (const state of rebuiltStates) states.put(state);
            meta.put(sequence, META.sequence);
            return { events: plan.events.length, rebuilt: plan.itemsToRebuild, sequence };
          });
        },
        (result) => ({ kind: 'replace', itemIds: result.rebuilt }),
      );
    },

    exportAll(exportedAt) {
      return read(() =>
        transaction(database(), [STORES.events, STORES.configs], 'readonly', async (tx) => {
          const events = (await request(tx.objectStore(STORES.events).getAll())) as LearningEvent[];
          const configs = (await request(tx.objectStore(STORES.configs).getAll())) as StoredSchedulerConfig[];
          return {
            schemaVersion: 1,
            exportedAt,
            deviceId,
            events: events.sort(compareReplayOrder),
            configs: configs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
          } satisfies LearningBackup;
        }),
      );
    },

    rebuildAll() {
      return write(
        async () => {
          await syncRegistry();
          return transaction(database(), [STORES.events, STORES.schedulerStates], 'readwrite', async (tx) => {
            const events = (await request(tx.objectStore(STORES.events).getAll())) as LearningEvent[];
            const states = tx.objectStore(STORES.schedulerStates);
            const rebuilt = [...groupByItem(events)].map(([itemId, itemEvents]) => rebuild(itemEvents, itemId));
            states.clear();
            for (const state of rebuilt) states.put(state);
            return rebuilt.map((state) => state.itemId);
          });
        },
        (itemIds) => ({ kind: 'rebuild', itemIds }),
      );
    },

    onExternalChange(callback) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
  };
  return repository;
};

export interface ResetOptions {
  indexedDB?: IDBFactory;
  dbName?: string;
  /** Tells other tabs to reload. Defaults to a short-lived `BroadcastChannel` when available. */
  channel?: ChannelLike | null;
}

/**
 * The explicit development reset: deletes the learning database. Open repositories, in this tab or
 * another, close their connection when asked and report `unavailable` afterwards; reload them.
 */
export const resetLearningData = async (options: ResetOptions = {}): Promise<void> => {
  const factory = options.indexedDB ?? (typeof indexedDB === 'undefined' ? undefined : indexedDB);
  try {
    if (!factory) throw new LearningStorageError({ kind: 'unavailable', message: 'IndexedDB is not available' });
    await deleteDatabase(factory, options.dbName ?? LEARNING_DB_NAME);
  } catch (error) {
    throw toStorageError(error);
  }
  const channel = options.channel === undefined ? defaultChannel() : options.channel;
  const message: LearningChangedMessage = { type: 'learning-changed', source: 'reset', change: { kind: 'reset', itemIds: [] } };
  try {
    channel?.postMessage(message);
  } catch {
    // Other tabs find out on their next write.
  } finally {
    if (options.channel === undefined) channel?.close();
  }
};
