import { IDBFactory } from 'fake-indexeddb';
import hsk1 from '../../../src/data/vocabulary/hsk1.json';
import type { ItemContent, WordEntry } from '../../../src/domain/learning/exercises';
import type { PoolItem } from '../../../src/domain/learning/sessions';
import type { ItemId, Timestamp } from '../../../src/domain/learning/types';
import { LearningStorageError, type ChannelLike, type LearningRepository } from '../../../src/persistence/learning';
import { createLearningSession, type LearningSession, type LearningSessionOptions } from '../../../src/stores/learningSessionStore';
import { createLearningStore, type LearningStore, type LearningStoreOptions } from '../../../src/stores/learningStore';
import { utcRule } from '../scheduler/fixtures';

export { utcRule };

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
/** 2026-11-05 09:00 UTC. */
export const MORNING: Timestamp = Date.UTC(2026, 10, 5, 9);

/** Every HSK 1 word, for distractors. */
export const vocabulary: WordEntry[] = (hsk1 as WordEntry[]).map((word) => ({ ...word }));
/** Twelve plain words (no particles or classifiers), in pool order. */
export const POOL_WORDS = ['爸爸', '杯子', '菜', '茶', '吃', '电脑', '电视', '电影', '飞机', '狗', '喝', '工作'].map((simplified) => {
  const found = vocabulary.find((word) => word.simplified === simplified);
  if (!found) throw new Error(`No word ${simplified}`);
  return found;
});
export const itemOf = (word: WordEntry): ItemId => `word-meaning:${word.id}`;

/** A clock the test moves by hand. */
export const testClock = (start: Timestamp = MORNING) => {
  let now = start;
  return {
    now: () => now,
    set: (value: Timestamp) => {
      now = value;
    },
    advance: (ms: number) => {
      now += ms;
    },
  };
};

/** In-memory channels that deliver each message to every other member, after the current task. */
export const channelBus = () => {
  const members = new Set<{ listeners: Set<(event: MessageEvent) => void> }>();
  return {
    channel(): ChannelLike {
      const member = { listeners: new Set<(event: MessageEvent) => void>() };
      members.add(member);
      return {
        postMessage(message) {
          for (const other of members) {
            if (other === member) continue;
            for (const listener of other.listeners) setTimeout(() => listener({ data: message } as MessageEvent), 0);
          }
        },
        addEventListener: (_type, listener) => member.listeners.add(listener),
        removeEventListener: (_type, listener) => member.listeners.delete(listener),
        close: () => members.delete(member),
      };
    },
  };
};

export type FailMode = 'before-write' | 'after-write';

/** Wraps a repository so the chosen method fails once: before writing, or after a write that did land. */
export const failOnce = (method: 'commitAnswer' | 'saveAttemptDraft' | 'voidAttempt', mode: FailMode, skip = 0) => {
  let calls = 0;
  let failed = false;
  return (create: () => LearningRepository): LearningRepository => {
    const repo = create();
    const original = repo[method].bind(repo) as (...args: unknown[]) => Promise<unknown>;
    const wrapped = async (...args: unknown[]) => {
      calls += 1;
      if (failed || calls <= skip) return original(...args);
      failed = true;
      const error = new LearningStorageError({ kind: 'aborted', message: 'Simulated abort' });
      if (mode === 'after-write') await original(...args);
      throw error;
    };
    return new Proxy(repo, {
      get: (target, key) => (key === method ? wrapped : Reflect.get(target, key)),
    });
  };
};

export interface Env {
  factory: IDBFactory;
  clock: ReturnType<typeof testClock>;
  /** Current content by word id; tests edit it to publish a new revision. */
  words: Map<string, WordEntry>;
  store(options?: Partial<LearningStoreOptions>): LearningStore;
  session(store: LearningStore, options: Omit<LearningSessionOptions, 'store'>): Promise<LearningSession>;
  closeAll(): void;
}

/** A fresh fake IndexedDB, clock and catalog per test. Stores built from it share the database. */
export const environment = (): Env => {
  const factory = new IDBFactory();
  const clock = testClock();
  const words = new Map(POOL_WORDS.map((word) => [word.id, { ...word, senses: word.senses.map((sense) => ({ ...sense })) }]));
  const stores: LearningStore[] = [];
  let storeCount = 0;
  const resolveContent = (itemId: ItemId): ItemContent | null => {
    const word = words.get(itemId.slice('word-meaning:'.length));
    return word ? { kind: 'word', word } : null;
  };
  const pool = (): PoolItem[] => POOL_WORDS.map((word) => ({ itemId: itemOf(word), available: words.has(word.id), topicIds: word.topicIds }));
  return {
    factory,
    clock,
    words,
    store(options = {}) {
      const prefix = `s${++storeCount}`;
      let next = 0;
      const store = createLearningStore({
        indexedDB: factory,
        channel: null,
        locks: null,
        deviceId: () => 'device-a',
        clock: clock.now,
        dayRule: utcRule,
        newId: () => `${prefix}-id-${++next}`,
        speechAvailable: () => true,
        resolveContent,
        pool,
        vocabulary: () => vocabulary,
        ...options,
      });
      stores.push(store);
      return store;
    },
    async session(store, options) {
      const session = createLearningSession({ seed: 7, autoAdvance: { setTimer: () => {} }, ...options, store });
      await session.ready;
      return session;
    },
    closeAll() {
      for (const store of stores.splice(0)) store.close();
    },
  };
};

/** The option that shows the item's own content. */
export const rightOption = (session: LearningSession): string => {
  const selection = session.view.selection;
  if (selection?.kind !== 'exercise') throw new Error('No exercise on screen');
  const option = selection.exercise.options.find((candidate) => candidate.contentId === selection.content.contentId);
  if (!option) throw new Error('No correct option');
  return option.id;
};

export const wrongOption = (session: LearningSession): string => {
  const selection = session.view.selection;
  if (selection?.kind !== 'exercise') throw new Error('No exercise on screen');
  const option = selection.exercise.options.find((candidate) => candidate.contentId !== selection.content.contentId);
  if (!option) throw new Error('No wrong option');
  return option.id;
};

/**
 * Answers the card on screen and waits for the write. Exposures continue; multiple choice picks
 * the right option (or a wrong one, then "No lo sé"); self-assessed cards reveal and rate.
 */
export const answerCard = async (session: LearningSession, outcome: 'right' | 'wrong' = 'right'): Promise<void> => {
  const selection = session.view.selection;
  if (!selection) throw new Error(`Nothing on screen in state ${session.view.state}`);
  if (selection.kind === 'exposure') session.actions.continue();
  else if (selection.exercise.grading === 'automatic') {
    if (outcome === 'right') session.actions.answer({ optionId: rightOption(session) });
    else session.actions.answer({ answer: null, optionId: null });
  } else {
    session.actions.reveal();
    session.actions.selfAssess(outcome === 'right' ? 'good' : 'again');
  }
  await session.idle();
};

/** Answers until the session finishes, moving on from every feedback. Returns the prompts seen. */
export const finish = async (session: LearningSession, outcome: (session: LearningSession) => 'right' | 'wrong' = () => 'right') => {
  const prompts: string[] = [];
  for (let guard = 0; guard < 200 && session.view.state !== 'finished'; guard++) {
    if (session.view.state === 'feedback') {
      session.actions.continue();
      continue;
    }
    if (session.view.state !== 'presenting') throw new Error(`Unexpected state ${session.view.state}`);
    const selection = session.view.selection;
    if (selection?.kind === 'exercise') prompts.push(selection.prompt);
    await answerCard(session, outcome(session));
  }
  if (session.view.state !== 'finished') throw new Error('The session did not finish');
  return prompts;
};

/** Moves the session forward until a card matches, answering the others right. */
export const advanceTo = async (session: LearningSession, matches: (session: LearningSession) => boolean): Promise<void> => {
  for (let guard = 0; guard < 200; guard++) {
    if (session.view.state === 'feedback') {
      session.actions.continue();
      continue;
    }
    if (session.view.state === 'presenting' && matches(session)) return;
    if (session.view.state !== 'presenting') throw new Error(`Unexpected state ${session.view.state}`);
    await answerCard(session);
  }
  throw new Error('No matching card');
};

export const isMultipleChoice = (session: LearningSession) =>
  session.view.selection?.kind === 'exercise' && session.view.selection.exercise.format === 'multiple-choice';

export const until = async (condition: () => boolean, tries = 100): Promise<void> => {
  for (let i = 0; i < tries; i++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Condition not met');
};
