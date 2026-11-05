import type { LocalDayRule, Scheduler } from '../../domain/learning/scheduler';
import type {
  ConfigId,
  ItemId,
  LearningBackup,
  LearningEvent,
  LocalDay,
  SchedulerState,
  SessionMode,
  SessionState,
  StoredSchedulerConfig,
  Timestamp,
} from '../../domain/learning/types';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** An event the caller wants written: everything but what the repository stamps. */
export type PendingEvent = DistributiveOmit<Exclude<LearningEvent, { type: 'attempt-voided' }>, 'deviceId' | 'sequence'>;

export type VoidEvent = Extract<LearningEvent, { type: 'attempt-voided' }>;
export type VoidReason = VoidEvent['reason'];

/**
 * The item's next cached state. A function runs inside the transaction with the cached state as
 * stored there (null for an item without one), so the decision cannot race another tab. It must
 * be synchronous: `Scheduler.apply` is. Return null to leave the cache as it is.
 */
export type NextState = SchedulerState | null | ((current: SchedulerState | null) => SchedulerState | null);

export interface CommitAnswerInput {
  event: PendingEvent;
  nextState: NextState;
  /** The session with its position moved past this answer. Omit when no session is open. */
  session?: SessionState | null;
}

export interface CommitResult<E extends LearningEvent = LearningEvent> {
  /** As stored, with the `deviceId` and `sequence` it was written with. */
  event: E;
  /** The item's cached state after the write. */
  state: SchedulerState | null;
  /** True when the event was already stored with the same content and nothing was written. */
  duplicate: boolean;
}

export interface VoidOptions {
  /** Pass the id from a first, failed call so a retry does not void twice. Generated otherwise. */
  id?: string;
  /** Defaults to the target event's session and mode. */
  sessionId?: string;
  sessionMode?: SessionMode;
}

export interface LoadedLearningData {
  deviceId: string;
  states: ReadonlyMap<ItemId, SchedulerState>;
  /** The session with `status: 'active'`, or null. */
  session: SessionState | null;
  configs: readonly StoredSchedulerConfig[];
}

export interface ImportResult {
  /** Events that were not stored before. */
  added: number;
  /** Items whose cache was rebuilt. Empty when the import added nothing. */
  rebuilt: readonly ItemId[];
  /** Configs that were not stored before. */
  addedConfigs: readonly ConfigId[];
}

export interface ReplaceResult {
  events: number;
  rebuilt: readonly ItemId[];
  /** The next `sequence` this device writes: the higher of the stored counter and its highest own sequence plus one. */
  sequence: number;
}

export type EventQuery = { itemId: ItemId } | { localDay: LocalDay } | { sessionId: string };

export interface LearningChange {
  kind: 'commit' | 'void' | 'import' | 'replace' | 'rebuild' | 'session' | 'reset';
  /** Items whose cached state changed. Empty for session drafts and resets. */
  itemIds: readonly ItemId[];
}

/** What the repository posts on the channel after a write commits. */
export interface LearningChangedMessage {
  type: 'learning-changed';
  /** The repository instance that wrote, so it can ignore its own messages if a channel echoes them. */
  source: string;
  change: LearningChange;
}

/** The part of `BroadcastChannel` the repository uses. */
export interface ChannelLike {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  close(): void;
}

/** The part of `LockManager` the repository uses. */
export interface LocksLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

export interface LearningRepositoryOptions {
  /** Defaults to `globalThis.indexedDB`. */
  indexedDB?: IDBFactory;
  /** Defaults to `LEARNING_DB_NAME`. */
  dbName?: string;
  /** The current config. New items cite it and it is stored at open. Create it before `open()`. */
  scheduler: Scheduler;
  /** Written to `meta` the first time the database opens; afterwards the stored id wins. Random if omitted. */
  deviceId?: string;
  /** Turns `now` into the `localDay` of void events. Defaults to `deviceLocalDayRule`. */
  localDayRule?: LocalDayRule;
  /** Defaults to `new BroadcastChannel(LEARNING_CHANNEL_NAME)` when available. Null turns it off. */
  channel?: ChannelLike | null;
  /** Defaults to `navigator.locks` when available. Null turns locking off. */
  locks?: LocksLike | null;
  /** Generates void event ids. Defaults to `crypto.randomUUID`. */
  newId?: () => string;
}

export interface LearningRepository {
  /** This device's id, read from `meta`. Valid after `open()`. */
  readonly deviceId: string;
  /**
   * Opens or creates the database, stores the current config, and moves the sequence counter past
   * this device's highest `sequence` in the log if it is behind.
   */
  open(): Promise<void>;
  close(): void;
  loadAll(): Promise<LoadedLearningData>;
  /** Events matching one index, in replay order. All events without a query. */
  listEvents(query?: EventQuery): Promise<LearningEvent[]>;
  /**
   * Appends the event, stores the item's next state and the session, in one transaction. Retrying
   * with the same event id and content returns the stored result and writes nothing.
   */
  commitAnswer(input: CommitAnswerInput): Promise<CommitResult>;
  /** Saves an in-progress attempt (actions, hints) so a reload resumes it. Writes no event. */
  saveAttemptDraft(session: SessionState): Promise<void>;
  /** Appends an `attempt-voided` and rebuilds the target's item, in one transaction. */
  voidAttempt(targetEventId: string, reason: VoidReason, now: Timestamp, options?: VoidOptions): Promise<CommitResult<VoidEvent>>;
  /**
   * Backup merge: parses and plans with the backup module (`parseBackupValue`, `planMerge`), then
   * writes the new events and configs and rebuilds every touched item in one transaction. Takes a
   * whole backup's events or a plan's `newEvents`; importing the same events again adds nothing.
   */
  importEvents(events: readonly LearningEvent[], configs: readonly StoredSchedulerConfig[]): Promise<ImportResult>;
  /**
   * Replace-restore with `planReplace`: drops the log, caches and pending session, writes the backup,
   * keeps the installed config stored and rebuilds every item.
   */
  replaceAll(backup: LearningBackup): Promise<ReplaceResult>;
  /** The whole log and every config, ready for `LearningBackup`. */
  exportAll(exportedAt: Timestamp): Promise<LearningBackup>;
  /** Drops every cached state and rebuilds each item from the log. */
  rebuildAll(): Promise<readonly ItemId[]>;
  /** Called when another tab or repository instance commits a write. Returns the unsubscribe. */
  onExternalChange(callback: (change: LearningChange) => void): () => void;
}
