/**
 * The learning database: one IndexedDB database, versioned here. There are no users yet, so a new
 * version may drop and recreate stores instead of migrating them; the log would then be lost, so
 * any version that keeps data must say how in `upgrade`.
 */
export const LEARNING_DB_NAME = 'jiayou-learning';
export const LEARNING_DB_VERSION = 1;

export const STORES = {
  /** The log, the source of truth. Key `id`. */
  events: 'events',
  /** Derived cache, one `SchedulerState` per item. Key `itemId`. Can be dropped and rebuilt. */
  schedulerStates: 'schedulerStates',
  /** `StoredSchedulerConfig` by `id`. */
  configs: 'configs',
  /** `SessionState` by `id`. At most one has `status: 'active'`. */
  sessions: 'sessions',
  /** Out-of-line keys from `META`. */
  meta: 'meta',
} as const;

export const EVENT_INDEXES = {
  itemId: 'itemId',
  attemptId: 'attemptId',
  localDay: 'localDay',
  sessionId: 'sessionId',
  /** Finds this device's highest `sequence` at open without `IDBKeyRange`. */
  deviceId: 'deviceId',
} as const;

export const META = {
  deviceId: 'deviceId',
  /** The next `sequence` this device writes. Starts at 0 and only grows. */
  sequence: 'sequence',
  schemaVersion: 'schemaVersion',
} as const;

export const upgrade = (db: IDBDatabase, oldVersion: number): void => {
  if (oldVersion < 1) {
    const events = db.createObjectStore(STORES.events, { keyPath: 'id' });
    events.createIndex(EVENT_INDEXES.itemId, 'itemId');
    // Not unique: voids and exposures have no attemptId and are left out of the index; two
    // attempt events with one attemptId are refused before the put, with a typed error.
    events.createIndex(EVENT_INDEXES.attemptId, 'attemptId');
    events.createIndex(EVENT_INDEXES.localDay, 'localDay');
    events.createIndex(EVENT_INDEXES.sessionId, 'sessionId');
    events.createIndex(EVENT_INDEXES.deviceId, 'deviceId');
    db.createObjectStore(STORES.schedulerStates, { keyPath: 'itemId' });
    db.createObjectStore(STORES.configs, { keyPath: 'id' });
    db.createObjectStore(STORES.sessions, { keyPath: 'id' });
    db.createObjectStore(STORES.meta);
  }
};
