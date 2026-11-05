import { IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createScheduler,
  createSchedulerRegistry,
  DEFAULT_SCHEDULER_CONFIG,
  rebuildItem,
  type Scheduler,
} from '../../../src/domain/learning/scheduler';
import type { LearningEvent } from '../../../src/domain/learning/types';
import {
  LearningStorageError,
  resetLearningData,
  type LearningRepository,
  type PendingEvent,
  type StorageError,
} from '../../../src/persistence/learning';
import {
  applyRating,
  at,
  fakeLocks,
  harness,
  nextChange,
  OTHER_WORD,
  pendingPractice,
  pendingReview,
  sessionWithHint,
  stored,
  WORD,
  type Harness,
} from './fixtures';

let scheduler: Scheduler;
let h: Harness;

beforeAll(async () => {
  scheduler = await createScheduler(DEFAULT_SCHEDULER_CONFIG);
});

afterEach(() => {
  vi.restoreAllMocks();
  h?.closeAll();
});

const fresh = () => {
  h = harness(scheduler);
  return h;
};

/** The typed error a call rejects with. Fails the test if it resolves. */
const failure = async (promise: Promise<unknown>): Promise<LearningStorageError> => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(LearningStorageError);
    return error as LearningStorageError;
  }
  throw new Error('Expected the call to fail');
};

const kindOf = (error: LearningStorageError): StorageError['kind'] => error.error.kind;
const reasonOf = (error: LearningStorageError) => (error.error.kind === 'rejected' ? error.error.reason : undefined);
const backupCodes = (error: LearningStorageError) => (error.error.kind === 'rejected' ? error.error.backupErrors?.map((e) => e.code) : undefined);

/** Commits Good, Again, Good on WORD, a day and a half apart, through the incremental path. */
const commitThreeReviews = async (repo: LearningRepository) => {
  const plan = [
    { id: 'r1', time: at(1), rating: 'good' },
    { id: 'r2', time: at(5), rating: 'again' },
    { id: 'r3', time: at(5, 1), rating: 'good' },
  ] as const;
  const results = [];
  for (const { id, time, rating } of plan) {
    results.push(
      await repo.commitAnswer({ event: pendingReview(id, time, rating, scheduler.configId), nextState: applyRating(scheduler, rating, time) }),
    );
  }
  return results;
};

describe('commitAnswer', () => {
  it('writes event, state and session in one go and stamps device and sequence', async () => {
    const repo = await fresh().open();
    const session = { ...sessionWithHint(), position: 1 };
    const result = await repo.commitAnswer({
      event: pendingReview('r1', at(1), 'good', scheduler.configId),
      nextState: applyRating(scheduler, 'good', at(1)),
      session,
    });
    expect(result.duplicate).toBe(false);
    expect(result.event).toMatchObject({ id: 'r1', deviceId: 'device-a', sequence: 0 });
    const loaded = await repo.loadAll();
    expect(loaded.states.get(WORD)).toEqual(result.state);
    expect(loaded.session).toEqual(session);
    expect(loaded.configs.map((config) => config.id)).toEqual([scheduler.configId]);
  });

  it('is idempotent: retrying the same write returns the stored result and writes nothing', async () => {
    const repo = await fresh().open();
    const input = { event: pendingReview('r1', at(1), 'good', scheduler.configId), nextState: applyRating(scheduler, 'good', at(1)) };
    const first = await repo.commitAnswer(input);
    const retry = await repo.commitAnswer(input);
    expect(retry).toEqual({ ...first, duplicate: true });
    expect(await repo.listEvents()).toHaveLength(1);
    // The retry did not spend a sequence number.
    const next = await repo.commitAnswer({ event: pendingPractice('p1', at(2)), nextState: null });
    expect(next.event.sequence).toBe(1);
  });

  it('refuses the same id with another content', async () => {
    const repo = await fresh().open();
    await repo.commitAnswer({ event: pendingReview('r1', at(1), 'good', scheduler.configId), nextState: null });
    const error = await failure(repo.commitAnswer({ event: pendingReview('r1', at(1), 'again', scheduler.configId), nextState: null }));
    expect(reasonOf(error)).toBe('conflicting-event');
    expect(error.retryable).toBe(false);
  });

  it('refuses a second event for the same attempt', async () => {
    const repo = await fresh().open();
    await repo.commitAnswer({ event: pendingReview('r1', at(1), 'good', scheduler.configId), nextState: null });
    const error = await failure(
      repo.commitAnswer({ event: pendingReview('r1-bis', at(1), 'good', scheduler.configId, { attemptId: 'attempt-r1' }), nextState: null }),
    );
    expect(reasonOf(error)).toBe('duplicate-attempt');
    expect((await repo.listEvents()).map((event) => event.id)).toEqual(['r1']);
  });

  it('refuses an event whose item id does not match its content, so exports always re-import', async () => {
    const repo = await fresh().open();
    const event = { ...pendingPractice('p1', at(1)), itemId: OTHER_WORD } as PendingEvent;
    const error = await failure(repo.commitAnswer({ event, nextState: null }));
    expect(reasonOf(error)).toBe('invalid-event');
    expect(backupCodes(error)).toEqual(['item-content-mismatch']);
  });

  it('runs validateAttemptEvent before writing', async () => {
    const repo = await fresh().open();
    const event = { ...pendingReview('r1', at(1), 'good', scheduler.configId), rating: 'easy' } as PendingEvent;
    const error = await failure(repo.commitAnswer({ event, nextState: null }));
    expect(reasonOf(error)).toBe('invalid-event');
    expect(error.error.kind === 'rejected' && error.error.errors?.map((e) => e.code)).toContain('rating-mismatch');
    expect(await repo.listEvents()).toEqual([]);
  });

  it('leaves nothing behind when the transaction is interrupted after the event was queued', async () => {
    const repo = await fresh().open();
    const error = await failure(
      repo.commitAnswer({
        event: pendingReview('r1', at(1), 'good', scheduler.configId),
        nextState: () => {
          throw new Error('crash between the event and the state');
        },
        session: sessionWithHint(),
      }),
    );
    expect(kindOf(error)).toBe('unknown');
    expect(await repo.listEvents()).toEqual([]);
    const loaded = await repo.loadAll();
    expect(loaded.states.size).toBe(0);
    expect(loaded.session).toBeNull();
    const next = await repo.commitAnswer({ event: pendingPractice('p1', at(2)), nextState: null });
    expect(next.event.sequence).toBe(0);
  });

  it('passes the state cached inside the transaction to a nextState function', async () => {
    const repo = await fresh().open();
    await commitThreeReviews(repo);
    const cached = (await repo.loadAll()).states.get(WORD);
    const seen: unknown[] = [];
    await repo.commitAnswer({
      event: pendingReview('r4', at(20), 'good', scheduler.configId),
      nextState: (current) => {
        seen.push(current);
        return applyRating(scheduler, 'good', at(20))(current);
      },
    });
    expect(cached).toBeDefined();
    expect(seen).toEqual([cached]);
  });
});

describe('injected write failures', () => {
  it('a put that throws QuotaExceededError surfaces as quota-exceeded and writes nothing', async () => {
    const repo = await fresh().open();
    const real = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      // The meta put and the event add are already queued when the state put fails.
      if (this.name === 'schedulerStates') throw new DOMException('Disk full', 'QuotaExceededError');
      return real.apply(this, args);
    });
    const error = await failure(
      repo.commitAnswer({ event: pendingReview('r1', at(1), 'good', scheduler.configId), nextState: applyRating(scheduler, 'good', at(1)) }),
    );
    expect(kindOf(error)).toBe('quota-exceeded');
    expect(error.retryable).toBe(true);
    vi.restoreAllMocks();

    expect(await repo.listEvents()).toEqual([]);
    expect((await repo.loadAll()).states.size).toBe(0);
    const retry = await repo.commitAnswer({
      event: pendingReview('r1', at(1), 'good', scheduler.configId),
      nextState: applyRating(scheduler, 'good', at(1)),
    });
    expect(retry).toMatchObject({ duplicate: false, event: { sequence: 0 } });
  });

  it('a request that fails asynchronously, as browsers report quota, aborts the whole transaction', async () => {
    const repo = await fresh().open();
    const real = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (this.name !== 'sessions') return real.apply(this, args);
      // fake-indexeddb's request runner: the operation throws when the request executes.
      const tx = this.transaction as unknown as { _execRequestAsync(request: { operation: () => never; source: unknown }): IDBRequest };
      return tx._execRequestAsync({
        operation: () => {
          throw new DOMException('Disk full', 'QuotaExceededError');
        },
        source: this,
      });
    });
    const error = await failure(
      repo.commitAnswer({
        event: pendingReview('r1', at(1), 'good', scheduler.configId),
        nextState: applyRating(scheduler, 'good', at(1)),
        session: sessionWithHint(),
      }),
    );
    expect(kindOf(error)).toBe('quota-exceeded');
    vi.restoreAllMocks();
    expect(await repo.listEvents()).toEqual([]);
    const loaded = await repo.loadAll();
    expect(loaded.states.size).toBe(0);
    expect(loaded.session).toBeNull();
  });
});

/** Makes `put` or `add` on `store` fail when the request runs, the way a browser reports quota. */
const failAsyncOn = (store: string) => {
  for (const method of ['put', 'add'] as const) {
    const real = IDBObjectStore.prototype[method];
    vi.spyOn(IDBObjectStore.prototype, method).mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (this.name !== store) return real.apply(this, args);
      const tx = this.transaction as unknown as { _execRequestAsync(request: { operation: () => never; source: unknown }): IDBRequest };
      return tx._execRequestAsync({
        operation: () => {
          throw new DOMException('Disk full', 'QuotaExceededError');
        },
        source: this,
      });
    });
  }
};

describe('injected failures that nothing awaits', () => {
  it('a failed event add, followed by awaited reads, still reports quota-exceeded', async () => {
    const repo = await fresh().open();
    failAsyncOn('events');
    const error = await failure(
      repo.commitAnswer({ event: pendingReview('r1', at(1), 'good', scheduler.configId), nextState: applyRating(scheduler, 'good', at(1)) }),
    );
    expect(kindOf(error)).toBe('quota-exceeded');
    vi.restoreAllMocks();
    expect(await repo.listEvents()).toEqual([]);
    expect((await repo.loadAll()).states.size).toBe(0);
  });

  it('an import that fails on its third store writes none of its events', async () => {
    const repo = await fresh().open({ deviceId: 'device-b' });
    const events = [
      stored(pendingReview('a-r1', at(1), 'good', scheduler.configId), 'device-a', 0),
      stored(pendingPractice('a-p1', at(2), { itemId: OTHER_WORD }), 'device-a', 1),
    ];
    failAsyncOn('schedulerStates');
    const error = await failure(repo.importEvents(events, []));
    expect(kindOf(error)).toBe('quota-exceeded');
    vi.restoreAllMocks();
    expect(await repo.listEvents()).toEqual([]);
    expect(await repo.importEvents(events, [])).toMatchObject({ added: 2 });
  });

  it('open() can be retried after its first transaction fails', async () => {
    const harnessed = fresh();
    failAsyncOn('meta');
    const error = await failure(harnessed.open());
    expect(kindOf(error)).toBe('quota-exceeded');
    vi.restoreAllMocks();
    const repo = await harnessed.open();
    expect(repo.deviceId).toBe('device-a');
    expect((await repo.loadAll()).configs.map((config) => config.id)).toEqual([scheduler.configId]);
  });
});

describe('drafts', () => {
  it('a reload keeps an in-progress attempt and its hint', async () => {
    const harnessed = fresh();
    const first = await harnessed.open();
    const session = sessionWithHint();
    await first.saveAttemptDraft(session);
    first.close();

    const reloaded = await harnessed.open();
    const { session: resumed } = await reloaded.loadAll();
    expect(resumed).toEqual(session);
    expect(resumed?.attempts[0].actions[0]).toMatchObject({ type: 'hint', hint: { kind: 'pinyin', revealsAnswer: false } });
  });

  it('keeps one active session: starting another drops the previous one', async () => {
    const repo = await fresh().open();
    await repo.saveAttemptDraft(sessionWithHint('session-1'));
    await repo.saveAttemptDraft(sessionWithHint('session-2'));
    expect((await repo.loadAll()).session?.id).toBe('session-2');
  });
});

describe('voidAttempt', () => {
  it('voiding then rebuilding equals rebuilding without the event', async () => {
    const repo = await fresh().open();
    const [r1, , r3] = await commitThreeReviews(repo);
    const result = await repo.voidAttempt('r2', 'user-correction', at(6));
    expect(result.event).toMatchObject({
      type: 'attempt-voided',
      itemId: WORD,
      targetEventId: 'r2',
      deviceId: 'device-a',
      sequence: 3,
      localDay: '2026-01-07',
      sessionId: 'session-1',
      sessionMode: 'today',
    });

    const registry = await createSchedulerRegistry([{ id: scheduler.configId, config: scheduler.config }]);
    const without = rebuildItem([r1.event, r3.event], WORD, scheduler, registry);
    expect(result.state).toEqual(without);
    expect((await repo.loadAll()).states.get(WORD)).toEqual(without);
    // The log keeps the voided review; the void is appended.
    expect((await repo.listEvents({ itemId: WORD })).map((event) => event.id)).toEqual(['r1', 'r2', 'r3', result.event.id]);
  });

  it('voiding twice is voiding once', async () => {
    const repo = await fresh().open();
    await commitThreeReviews(repo);
    const first = await repo.voidAttempt('r2', 'user-correction', at(6));
    const second = await repo.voidAttempt('r2', 'user-correction', at(7));
    expect(second).toEqual({ ...first, duplicate: true });
    expect(await repo.listEvents()).toHaveLength(4);
  });

  it('refuses a missing target and an exposure', async () => {
    const repo = await fresh().open();
    const exposure = {
      schemaVersion: 1,
      id: 'x1',
      sessionId: 'session-1',
      sessionMode: 'today',
      occurredAt: at(1),
      localDay: '2026-01-02',
      type: 'exposure',
      itemId: WORD,
      content: { contentId: 'word-4f60-597d-ni3-hao3', contentRevision: 'rev-1' },
      card: { id: 'card', reason: 'teaching', answer: { characters: '你好', pinyin: 'nǐ hǎo', meaning: 'hola' }, audio: null },
    } as const;
    await repo.commitAnswer({ event: exposure, nextState: null });
    expect(reasonOf(await failure(repo.voidAttempt('missing', 'other', at(2))))).toBe('invalid-void');
    expect(reasonOf(await failure(repo.voidAttempt('x1', 'other', at(2))))).toBe('invalid-void');
    expect(await repo.listEvents()).toHaveLength(1);
  });
});

describe('importEvents', () => {
  it('importing the same events twice is a no-op the second time', async () => {
    const source = await fresh().open();
    await commitThreeReviews(source);
    const backup = await source.exportAll(at(10));

    const target = await h.open({ dbName: 'other-device', deviceId: 'device-b' });
    const first = await target.importEvents(backup.events, backup.configs);
    expect(first).toEqual({ added: 3, rebuilt: [WORD], addedConfigs: [] });
    expect((await target.loadAll()).states.get(WORD)).toEqual((await source.loadAll()).states.get(WORD));

    const second = await target.importEvents(backup.events, backup.configs);
    expect(second).toEqual({ added: 0, rebuilt: [], addedConfigs: [] });
    expect(await target.listEvents()).toHaveLength(3);
  });

  it('one bad event in the batch changes nothing', async () => {
    const repo = await fresh().open({ deviceId: 'device-b' });
    await repo.commitAnswer({ event: pendingPractice('mine', at(1), { itemId: OTHER_WORD }), nextState: null });
    const before = await repo.exportAll(at(9));
    const statesBefore = (await repo.loadAll()).states;

    const good = stored(pendingReview('a-r1', at(1), 'good', scheduler.configId), 'device-a', 1);
    const bad = { ...stored(pendingReview('a-r2', at(3), 'good', scheduler.configId), 'device-a', 2), evaluatorVersion: 'unknown@9' } as LearningEvent;
    const error = await failure(repo.importEvents([good, bad], before.configs));
    expect(reasonOf(error)).toBe('invalid-backup');
    expect(backupCodes(error)).toEqual(['invalid-attempt-event']);
    expect(error.error.kind === 'rejected' && error.error.eventId).toBe('a-r2');

    expect(await repo.exportAll(at(9))).toEqual(before);
    expect((await repo.loadAll()).states).toEqual(statesBefore);
  });

  it('refuses a batch whose union has two events for one attempt, voided or not', async () => {
    const repo = await fresh().open({ deviceId: 'device-b' });
    await repo.commitAnswer({ event: pendingReview('mine', at(1), 'good', scheduler.configId, { attemptId: 'shared' }), nextState: null });
    const theirs = stored(pendingReview('theirs', at(2), 'good', scheduler.configId, { attemptId: 'shared' }), 'device-a', 1);
    const error = await failure(repo.importEvents([theirs], []));
    expect(backupCodes(error)).toEqual(['duplicate-attempt']);
    expect(await repo.listEvents()).toHaveLength(1);
  });

  it('refuses a review citing a config neither side has', async () => {
    const repo = await fresh().open();
    const event = stored(pendingReview('x', at(1), 'good', `scheduler-config:sha256:${'0'.repeat(64)}`), 'device-a', 1);
    expect(backupCodes(await failure(repo.importEvents([event], [])))).toEqual(['unknown-config']);
  });

  it('adds a new config and rebuilds with it', async () => {
    const slower = await createScheduler({ ...DEFAULT_SCHEDULER_CONFIG, desiredRetention: 0.8 });
    const repo = await fresh().open();
    const event = stored(pendingReview('x', at(1), 'good', slower.configId), 'device-z', 1);
    const result = await repo.importEvents([event], [{ id: slower.configId, config: slower.config }]);
    expect(result.addedConfigs).toEqual([slower.configId]);
    expect((await repo.loadAll()).states.get(WORD)).toEqual(slower.apply(slower.newState(WORD), 'good', at(1)));
  });
});

describe('replaceAll and the sequence counter', () => {
  const backupWithOwnSequence = (deviceId: string, highest: number) => ({
    schemaVersion: 1 as const,
    exportedAt: at(30),
    deviceId,
    events: [
      stored(pendingPractice('old-1', at(1)), deviceId, highest - 1),
      stored(pendingReview('old-2', at(2), 'good', scheduler.configId), deviceId, highest),
      stored(pendingPractice('far', at(3), { itemId: OTHER_WORD }), 'device-z', 99),
    ],
    configs: [{ id: scheduler.configId, config: scheduler.config }],
  });

  it('moves the counter up to the highest own sequence in the backup', async () => {
    const repo = await fresh().open();
    await commitThreeReviews(repo);
    const result = await repo.replaceAll(backupWithOwnSequence('device-a', 10));
    expect(result).toEqual({ events: 3, rebuilt: [OTHER_WORD, WORD].sort(), sequence: 11 });
    expect((await repo.listEvents()).map((event) => event.id)).toEqual(['old-1', 'old-2', 'far']);
    const next = await repo.commitAnswer({ event: pendingPractice('p', at(40)), nextState: null });
    expect(next.event.sequence).toBe(11);
  });

  it('never moves the counter back', async () => {
    const repo = await fresh().open();
    // Own events imported from an older backup push the counter past 20.
    await repo.importEvents([stored(pendingPractice('own-20', at(1)), 'device-a', 20)], []);
    const result = await repo.replaceAll(backupWithOwnSequence('device-a', 5));
    expect(result.sequence).toBe(21);
    const next = await repo.commitAnswer({ event: pendingPractice('p', at(40)), nextState: null });
    expect(next.event.sequence).toBe(21);
  });

  it('drops the pending session and every cache', async () => {
    const repo = await fresh().open();
    await commitThreeReviews(repo);
    await repo.saveAttemptDraft(sessionWithHint());
    await repo.replaceAll({ schemaVersion: 1, exportedAt: at(30), deviceId: 'device-z', events: [], configs: [] });
    const loaded = await repo.loadAll();
    expect(loaded.session).toBeNull();
    expect(loaded.states.size).toBe(0);
    expect(loaded.configs.map((config) => config.id)).toEqual([scheduler.configId]);
  });

  it('reopening keeps the counter at the highest own sequence in the log', async () => {
    const harnessed = fresh();
    const repo = await harnessed.open();
    await commitThreeReviews(repo);
    repo.close();
    const again = await harnessed.open();
    expect(again.deviceId).toBe('device-a');
    const next = await again.commitAnswer({ event: pendingPractice('p', at(40)), nextState: null });
    expect(next.event.sequence).toBe(3);
  });
});

describe('several tabs', () => {
  it('two instances on one database see each other through the change hook', async () => {
    const harnessed = fresh();
    // The default channel: the platform BroadcastChannel.
    const tabA = await harnessed.open({ channel: undefined });
    const tabB = await harnessed.open({ channel: undefined });
    const ownEcho = vi.fn();
    tabA.onExternalChange(ownEcho);
    const heard = nextChange(tabB);

    await tabA.commitAnswer({ event: pendingReview('r1', at(1), 'good', scheduler.configId), nextState: applyRating(scheduler, 'good', at(1)) });
    expect(await heard).toEqual({ kind: 'commit', itemIds: [WORD] });
    expect((await tabB.loadAll()).states.get(WORD)?.state).toBe('review');

    const heardBack = nextChange(tabA);
    await tabB.voidAttempt('r1', 'user-correction', at(2));
    expect(await heardBack).toEqual({ kind: 'void', itemIds: [WORD] });
    expect((await tabA.loadAll()).states.get(WORD)?.state).toBe('new');
    expect(ownEcho).toHaveBeenCalledTimes(1);
  });

  it('runs every write under the learning lock', async () => {
    const locks = fakeLocks();
    const repo = await fresh().open({ locks });
    await repo.commitAnswer({ event: pendingPractice('p1', at(1)), nextState: null });
    await repo.saveAttemptDraft(sessionWithHint());
    await repo.voidAttempt('p1', 'other', at(2));
    expect(locks.requests).toEqual(['jiayou-learning-write', 'jiayou-learning-write', 'jiayou-learning-write']);
  });

  it('serializes concurrent commits without repeating a sequence', async () => {
    const harnessed = fresh();
    const tabA = await harnessed.open();
    const tabB = await harnessed.open();
    const results = await Promise.all([
      tabA.commitAnswer({ event: pendingPractice('a', at(1)), nextState: null }),
      tabB.commitAnswer({ event: pendingPractice('b', at(1)), nextState: null }),
      tabA.commitAnswer({ event: pendingPractice('c', at(1)), nextState: null }),
    ]);
    expect(results.map((result) => result.event.sequence).sort()).toEqual([0, 1, 2]);
  });
});

describe('resetLearningData', () => {
  it('deletes the database; an open repository then reports unavailable', async () => {
    const harnessed = fresh();
    const repo = await harnessed.open();
    await commitThreeReviews(repo);
    await resetLearningData({ indexedDB: harnessed.factory, channel: null });
    const error = await failure(repo.loadAll());
    expect(kindOf(error)).toBe('unavailable');

    const reopened = await harnessed.open();
    expect(await reopened.listEvents()).toEqual([]);
  });
});
