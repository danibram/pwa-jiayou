import { IDBFactory } from 'fake-indexeddb';
import { evaluatorVersion } from '../../../src/domain/learning/evaluation';
import type { Scheduler } from '../../../src/domain/learning/scheduler';
import type {
  ConfigId,
  ItemId,
  LearningEvent,
  Rating,
  SchedulerState,
  SessionState,
  Timestamp,
} from '../../../src/domain/learning/types';
import {
  createLearningRepository,
  type ChannelLike,
  type LearningChange,
  type LearningRepository,
  type LearningRepositoryOptions,
  type LocksLike,
  type PendingEvent,
} from '../../../src/persistence/learning';
import { answer, correct, hint, incorrect, meaningCard, rate, recognizeCard, reveal } from '../evaluation/fixtures';
import { at, utcRule, WORD } from '../scheduler/fixtures';

export { at, utcRule, WORD };
export const OTHER_WORD: ItemId = 'word-meaning:word-8c22-8c22-xie4-xie5';

/** The backup parser requires `itemId` to be the kind and the content id. */
const contentOf = (itemId: ItemId) => ({ contentId: itemId.slice(itemId.indexOf(':') + 1), contentRevision: 'rev-1' });
const content = contentOf(WORD);

interface Common {
  itemId?: ItemId;
  attemptId?: string;
  sessionId?: string;
}

const attemptBase = (id: string, occurredAt: Timestamp, common: Common) => ({
  schemaVersion: 1 as const,
  id,
  sessionId: common.sessionId ?? 'session-1',
  sessionMode: 'today' as const,
  occurredAt,
  localDay: utcRule.localDay(occurredAt),
  itemId: common.itemId ?? WORD,
  attemptId: common.attemptId ?? `attempt-${id}`,
  content: contentOf(common.itemId ?? WORD),
  exercise: meaningCard,
  evaluatorVersion,
  evidence: [],
});

/** A due review that `validateAttemptEvent` accepts: reveal, then the self-assessed rating. */
export const pendingReview = (id: string, occurredAt: Timestamp, rating: Rating, configId: ConfigId, common: Common = {}): PendingEvent => {
  const shared = { ...attemptBase(id, occurredAt, common), type: 'scheduled-review' as const, configId, actions: [reveal(), rate(rating)] };
  return rating === 'again'
    ? { ...shared, basis: 'due', rating: 'again', evaluation: incorrect }
    : { ...shared, basis: 'due', rating, evaluation: correct };
};

/** A multiple-choice practice answered right at the first try. */
export const pendingPractice = (id: string, occurredAt: Timestamp, common: Common = {}): PendingEvent => ({
  ...attemptBase(id, occurredAt, common),
  exercise: recognizeCard,
  type: 'practice',
  evaluation: correct,
  actions: [answer(correct, 'o1')],
});

/** The event as the log of `deviceId` would hold it. */
export const stored = (event: PendingEvent, deviceId: string, sequence: number): LearningEvent =>
  ({ ...event, deviceId, sequence }) as LearningEvent;

/** The incremental path the session uses: apply the rating to whatever the cache holds. */
export const applyRating =
  (scheduler: Scheduler, rating: Rating, now: Timestamp) =>
  (current: SchedulerState | null): SchedulerState =>
    scheduler.apply(current ?? scheduler.newState(WORD), rating, now);

/** A session with one open attempt that already used a pinyin hint. */
export const sessionWithHint = (id = 'session-1'): SessionState => ({
  schemaVersion: 1,
  id,
  mode: 'today',
  status: 'active',
  startedAt: at(1),
  queue: [{ itemId: WORD, intent: 'scheduled', reason: 'due-review', content, exercise: meaningCard, exposure: null, evaluatorVersion }],
  position: 0,
  attempts: [
    {
      id: 'attempt-open',
      eventId: 'event-open',
      itemId: WORD,
      content,
      exercise: meaningCard,
      evaluatorVersion,
      actions: [hint(false, 'pinyin')],
      status: 'in-progress',
    },
  ],
});

export const nextChange = (repo: LearningRepository): Promise<LearningChange> =>
  new Promise((resolve) => {
    const off = repo.onExternalChange((change) => {
      off();
      resolve(change);
    });
  });

/** Counts lock requests and runs them one after another, like `navigator.locks` for one name. */
export const fakeLocks = (): LocksLike & { requests: string[] } => {
  let tail: Promise<unknown> = Promise.resolve();
  const requests: string[] = [];
  return {
    requests,
    request<T>(name: string, callback: () => Promise<T>) {
      requests.push(name);
      const run = tail.then(callback, callback);
      tail = run.catch(() => {});
      return run;
    },
  };
};

export interface Harness {
  factory: IDBFactory;
  open(options?: Partial<LearningRepositoryOptions>): Promise<LearningRepository>;
  closeAll(): void;
}

/** A fresh in-memory IndexedDB per test; repositories default to no channel and no locks. */
export const harness = (scheduler: Scheduler): Harness => {
  const factory = new IDBFactory();
  const opened: LearningRepository[] = [];
  return {
    factory,
    async open(options = {}) {
      const repo = createLearningRepository({
        indexedDB: factory,
        scheduler,
        deviceId: 'device-a',
        localDayRule: utcRule,
        channel: null,
        locks: null,
        ...options,
      });
      opened.push(repo);
      await repo.open();
      return repo;
    },
    closeAll() {
      for (const repo of opened.splice(0)) repo.close();
    },
  };
};

export type { ChannelLike };
