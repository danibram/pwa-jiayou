// IndexedDB learning repository: the event log is the source of truth, per-item SchedulerState a
// derived cache. The backup module calls importEvents, replaceAll and exportAll; keep their
// signatures stable.
export { createLearningRepository, resetLearningData, LEARNING_CHANNEL_NAME, LEARNING_LOCK_NAME, type ResetOptions } from './repository';
export { LEARNING_DB_NAME, LEARNING_DB_VERSION } from './schema';
export { isLearningStorageError, LearningStorageError, type RejectReason, type StorageError } from './errors';
export type {
  ChannelLike,
  CommitAnswerInput,
  CommitResult,
  EventQuery,
  ImportResult,
  LearningChange,
  LearningChangedMessage,
  LearningRepository,
  LearningRepositoryOptions,
  LoadedLearningData,
  LocksLike,
  NextState,
  PendingEvent,
  ReplaceResult,
  VoidEvent,
  VoidOptions,
  VoidReason,
} from './types';
