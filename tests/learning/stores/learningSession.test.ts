import { afterEach, describe, expect, it } from 'vitest';
import { createSchedulerRegistry, rebuildItem } from '../../../src/domain/learning/scheduler';
import type { LearningEvent } from '../../../src/domain/learning/types';
import type { LearningStore } from '../../../src/stores/learningStore';
import {
  advanceTo,
  answerCard,
  channelBus,
  DAY,
  environment,
  failOnce,
  finish,
  isMultipleChoice,
  itemOf,
  POOL_WORDS,
  until,
  wrongOption,
  type Env,
} from './fixtures';

let env: Env;
afterEach(() => env?.closeAll());

const fresh = () => {
  env = environment();
  return env;
};

const log = async (store: LearningStore): Promise<LearningEvent[]> => store.runtime().repo.listEvents();

/** The cache the session wrote must equal a rebuild from the log. */
const expectCacheMatchesLog = async (store: LearningStore) => {
  const rt = store.runtime();
  const events = await rt.repo.listEvents();
  const loaded = await rt.repo.loadAll();
  const registry = await createSchedulerRegistry(loaded.configs);
  for (const [itemId, state] of loaded.states) {
    expect(rebuildItem(events, itemId, rt.scheduler, registry), itemId).toEqual(state);
  }
};

/** Day 0: teach every word Hoy allows, answering right. Returns the store. */
const teachDay = async (e: Env) => {
  const store = e.store();
  const session = await e.session(store, { mode: 'today' });
  await finish(session);
  return { store, session };
};

describe('learning session controller', () => {
  it('runs a whole session offline, from plan to finish, and the next day rates the words', async () => {
    const e = fresh();
    const { store, session } = await teachDay(e);
    const summary = session.summary();
    expect(summary.recorded).toEqual({ exposure: 10, practice: 10, 'scheduled-review': 0, 'invalid-attempt': 0 });
    expect(store.newLeftToday()).toBe(0);
    const first = itemOf(POOL_WORDS[0]);
    expect(store.status(first)).toBe('learning');
    expect(store.state(first)).toMatchObject({ state: 'new', eligibleFrom: '2026-11-06' });
    expect(store.status(itemOf(POOL_WORDS[11]))).toBe('new');
    expect((await store.runtime().repo.loadAll()).session).toBeNull();

    e.clock.advance(DAY);
    expect(store.pendingToday()).toBe(10);
    const next = await e.session(store, { mode: 'today' });
    const prompts = await finish(next);
    expect(prompts.filter((prompt) => prompt === 'meaning')).toHaveLength(10);
    expect(next.summary().recorded['scheduled-review']).toBe(10);
    expect(next.summary().nextReviews).toHaveLength(10);
    expect(store.status(first)).toBe('review');
    expect(store.pendingToday()).toBe(0);
    expect(store.history(first).map((entry) => entry.event.type)).toEqual(['exposure', 'practice', 'scheduled-review']);
    await expectCacheMatchesLog(store);
  });

  it('keeps a wrong answer and a hint across a reload, and resumes at the same card', async () => {
    const e = fresh();
    const store = e.store();
    const session = await e.session(store, { mode: 'today' });
    await advanceTo(session, isMultipleChoice);
    const position = session.view.position;
    const exerciseId = session.view.selection?.kind === 'exercise' ? session.view.selection.exercise.id : null;
    session.actions.answer({ optionId: wrongOption(session) });
    session.actions.hint({ kind: 'pinyin', revealsAnswer: false, value: 'x' });
    await session.idle();
    expect(session.view.state).toBe('presenting');
    store.close();

    const reloaded = e.store();
    const resumed = await e.session(reloaded, { mode: 'today' });
    expect(resumed.view.state).toBe('presenting');
    expect(resumed.view.position).toBe(position);
    expect(resumed.view.selection?.kind === 'exercise' && resumed.view.selection.exercise.id).toBe(exerciseId);
    expect(resumed.view.actions.map((action) => action.type)).toEqual(['answer', 'hint']);
    expect(resumed.view.actions[0]).toMatchObject({ evaluation: { outcome: 'incorrect' } });
    expect(resumed.view.actions[1]).toMatchObject({ hint: { kind: 'pinyin', revealsAnswer: false, value: 'x' } });

    // The kept wrong answer decides the evaluation once the attempt ends.
    await answerCard(resumed);
    expect(resumed.view.feedback).toMatchObject({ outcome: 'incorrect', recorded: 'practice' });
  });

  it('continues at the same card after a reload between answers', async () => {
    const e = fresh();
    const store = e.store();
    const session = await e.session(store, { mode: 'today' });
    for (let i = 0; i < 4; i++) {
      await answerCard(session);
      if (session.view.state === 'feedback') session.actions.continue();
    }
    const position = session.view.position;
    const selection = JSON.stringify(session.view.selection);
    store.close();
    const resumed = await e.session(e.store(), { mode: 'today' });
    expect(resumed.view.position).toBe(position);
    expect(JSON.stringify(resumed.view.selection)).toBe(selection);
    expect(resumed.sessionId()).toBe(session.sessionId());
  });

  it('resumes a topic session after a reload when the topics match in any order', async () => {
    const e = fresh();
    const store = e.store();
    const session = await e.session(store, { mode: 'topic', scope: { kind: 'topics', topicIds: ['comida', 'casa'] } });
    expect(session.view.selection?.kind).toBe('exposure');
    await answerCard(session);
    const position = session.view.position;
    const selection = JSON.stringify(session.view.selection);
    expect((await store.runtime().loadSession())?.scope).toEqual({ kind: 'topics', topicIds: ['comida', 'casa'] });
    store.close();

    const resumed = await e.session(e.store(), { mode: 'topic', scope: { kind: 'topics', topicIds: ['casa', 'comida'] } });
    expect(resumed.sessionId()).toBe(session.sessionId());
    expect(resumed.view.position).toBe(position);
    expect(JSON.stringify(resumed.view.selection)).toBe(selection);
  });

  it('starts fresh when the stored session is for another topic', async () => {
    const e = fresh();
    const store = e.store();
    const session = await e.session(store, { mode: 'topic', scope: { kind: 'topics', topicIds: ['comida'] } });
    await answerCard(session);
    store.close();

    const reloaded = e.store();
    const other = await e.session(reloaded, { mode: 'topic', scope: { kind: 'topics', topicIds: ['casa'] } });
    expect(other.sessionId()).not.toBe(session.sessionId());
    expect(other.view.position).toBe(0);
    const casa = new Set(POOL_WORDS.filter((word) => word.topicIds?.includes('casa')).map(itemOf));
    expect(casa.has(other.view.selection!.itemId)).toBe(true);
    expect((await reloaded.runtime().loadSession())?.scope).toEqual({ kind: 'topics', topicIds: ['casa'] });
  });

  it.each(['before-write', 'after-write'] as const)('retries a failed answer write (%s) and stores exactly one event', async (mode) => {
    const e = fresh();
    const store = e.store({ repository: failOnce('commitAnswer', mode) });
    const session = await e.session(store, { mode: 'today' });
    expect(session.view.selection?.kind).toBe('exposure');
    session.actions.continue();
    await session.idle();
    expect(session.view.state).toBe('error');
    expect(session.view.error).toMatchObject({ retryable: true });
    expect(await log(store)).toHaveLength(mode === 'after-write' ? 1 : 0);

    session.actions.retry();
    await session.idle();
    expect(session.view.state).toBe('presenting');
    expect(session.view.position).toBe(1);
    const events = await log(store);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('exposure');
  });

  it('retries a failed answer on a scored card without a second event', async () => {
    const e = fresh();
    const { store } = await teachDay(e);
    store.close();
    e.clock.advance(DAY);
    const failing = e.store({ repository: failOnce('commitAnswer', 'after-write') });
    const session = await e.session(failing, { mode: 'today' });
    session.actions.reveal();
    session.actions.selfAssess('good');
    await session.idle();
    expect(session.view.state).toBe('error');
    session.actions.retry();
    await session.idle();
    expect(session.view.state).toBe('feedback');
    expect(session.view.feedback).toEqual({ outcome: 'correct', rating: 'good', recorded: 'scheduled-review' });
    expect((await log(failing)).filter((event) => event.type === 'scheduled-review')).toHaveLength(1);
  });

  it('undoes one specific answer, rebuilds the item and asks the card again', async () => {
    const e = fresh();
    const { store } = await teachDay(e);
    e.clock.advance(DAY);
    const session = await e.session(store, { mode: 'today' });
    // Rate the first card, then fail the second and undo only that one.
    await answerCard(session);
    session.actions.continue();
    const itemId = session.view.selection!.itemId;
    const total = session.view.total;
    // The first answer can still be undone until this card is touched.
    expect(session.view.canUndo).toBe(true);
    session.actions.reveal();
    expect(session.view.canUndo).toBe(false);
    session.actions.selfAssess('again');
    await session.idle();
    expect(session.view.feedback).toMatchObject({ rating: 'again' });
    expect(session.view.total).toBe(total + 1);
    expect(session.view.canUndo).toBe(true);
    expect(store.status(itemId)).toBe('weak');

    session.actions.undoLast();
    await session.idle();
    expect(session.view.state).toBe('presenting');
    expect(session.view.selection?.itemId).toBe(itemId);
    expect(session.view.actions).toEqual([]);
    expect(session.view.total).toBe(total);
    expect(store.state(itemId)).toMatchObject({ state: 'new' });
    expect(store.history(itemId).map((entry) => [entry.event.type, entry.voided])).toEqual([
      ['exposure', false],
      ['practice', false],
      ['scheduled-review', true],
    ]);

    await answerCard(session);
    expect(session.view.feedback).toMatchObject({ rating: 'good' });
    expect(store.status(itemId)).toBe('review');
    expect(session.summary().recorded['scheduled-review']).toBe(2);
    await expectCacheMatchesLog(store);
  });

  it('requeues an item four cards after Again, as practice', async () => {
    const e = fresh();
    const { store } = await teachDay(e);
    e.clock.advance(DAY);
    const session = await e.session(store, { mode: 'today' });
    const itemId = session.view.selection!.itemId;
    await answerCard(session, 'wrong');
    const entries = (await store.runtime().loadSession())!.queue;
    expect(entries[5]).toMatchObject({ itemId, intent: 'practice', reason: 'requeue' });
    expect(entries.filter((entry) => entry.itemId === itemId)).toHaveLength(2);
  });

  it('"Ya la sé" with a clean recall writes the already-known rating', async () => {
    const e = fresh();
    const store = e.store();
    const session = await e.session(store, { mode: 'today' });
    const itemId = session.view.selection!.itemId;
    expect(session.card()).toMatchObject({ intent: 'teach', canClaimKnown: true });
    const total = session.view.total;
    session.actions.knowIt();
    await session.idle();
    expect(session.view.selection).toMatchObject({ kind: 'exercise', itemId, prompt: 'meaning' });
    expect(session.card()).toMatchObject({ intent: 'already-known-check' });
    // The practice planned after teaching leaves the session.
    expect(session.view.total).toBe(total - 1);
    await answerCard(session);
    expect(session.view.feedback).toEqual({ outcome: 'correct', rating: 'good', recorded: 'scheduled-review' });
    const events = store.history(itemId).map((entry) => entry.event);
    expect(events[0]).toMatchObject({ type: 'exposure', card: { reason: 'already-known' } });
    expect(events[1]).toMatchObject({ type: 'scheduled-review', basis: 'already-known', rating: 'good' });
    // FSRS graduates a first Good straight to review.
    expect(store.status(itemId)).toBe('review');
    // An already-known claim does not spend the new-word budget.
    expect(store.newLeftToday()).toBe(10);
  });

  it('"Ya la sé" with a miss writes practice and teaches the word again', async () => {
    const e = fresh();
    const store = e.store();
    const session = await e.session(store, { mode: 'today' });
    const itemId = session.view.selection!.itemId;
    session.actions.knowIt();
    await session.idle();
    const total = session.view.total;
    await answerCard(session, 'wrong');
    expect(session.view.feedback).toEqual({ outcome: 'incorrect', rating: null, recorded: 'practice' });
    expect(session.view.total).toBe(total + 2);
    const queue = (await store.runtime().loadSession())!.queue.filter((entry) => entry.itemId === itemId);
    expect(queue.map((entry) => [entry.intent, entry.reason])).toEqual([
      ['already-known-check', 'claimed-known'],
      ['teach', 'teach-again'],
      ['practice', 'teach-again'],
    ]);
    expect(store.state(itemId)).toMatchObject({ state: 'new', eligibleFrom: null });
  });

  it('closes an attempt as content-changed when its word changed, and regenerates silent cards', async () => {
    const e = fresh();
    const store = e.store();
    const session = await e.session(store, { mode: 'today' });
    await advanceTo(session, isMultipleChoice);
    const itemId = session.view.selection!.itemId;
    const position = session.view.position;
    session.actions.answer({ optionId: wrongOption(session) });
    await session.idle();
    const later = (await store.runtime().loadSession())!.queue.slice(position + 1).find((entry) => entry.itemId !== itemId)!;
    store.close();

    for (const id of [itemId, later.itemId]) {
      const word = e.words.get(id.slice('word-meaning:'.length))!;
      e.words.set(word.id, { ...word, senses: [{ ...word.senses[0], text: `${word.senses[0].text} (corregido)` }, ...word.senses.slice(1)] });
    }
    const reloaded = e.store();
    const resumed = await e.session(reloaded, { mode: 'today' });
    expect(resumed.view.state).toBe('presenting');
    expect(resumed.view.position).toBe(position);
    expect(resumed.view.actions).toEqual([]);
    const invalid = (await log(reloaded)).filter((event) => event.type === 'invalid-attempt');
    expect(invalid).toHaveLength(1);
    expect(invalid[0]).toMatchObject({ itemId, evaluation: { outcome: 'invalid', reason: 'content-changed' } });
    const stored = (await reloaded.runtime().loadSession())!;
    expect(stored.queue[position].content.contentRevision).not.toBe((invalid[0] as { content: { contentRevision: string } }).content.contentRevision);
    // The later card changed without actions: regenerated, no event.
    const regenerated = stored.queue.slice(position + 1).find((entry) => entry.itemId === later.itemId)!;
    expect(regenerated.content.contentRevision).not.toBe(later.content.contentRevision);
    expect((await log(reloaded)).filter((event) => event.itemId === later.itemId && event.type !== 'exposure')).toHaveLength(0);
  });

  it('reloads when another tab writes', async () => {
    const e = fresh();
    const bus = channelBus();
    const first = e.store({ channel: bus.channel() });
    const second = e.store({ channel: bus.channel() });
    await second.init();
    const session = await e.session(first, { mode: 'today' });
    const itemId = session.view.selection!.itemId;
    expect(second.status(itemId)).toBe('new');
    await answerCard(session);
    await until(() => second.status(itemId) === 'learning');
    expect(second.history(itemId)).toHaveLength(1);
  });

  it('records a speech failure as an invalid attempt', async () => {
    const e = fresh();
    const store = e.store();
    const session = await e.session(store, { mode: 'today' });
    await advanceTo(session, (s) => s.view.selection?.kind === 'exercise');
    session.actions.audioFailed();
    await session.idle();
    expect(session.view.feedback).toEqual({ outcome: 'invalid', rating: null, recorded: 'invalid-attempt' });
    expect((await log(store)).at(-1)).toMatchObject({ type: 'invalid-attempt', evaluation: { reason: 'technical-error' }, evidence: [] });
  });

  it('moves on by itself after a correct pick, and never after a self-assessment', async () => {
    const e = fresh();
    const store = e.store();
    const timers: (() => void)[] = [];
    const session = await e.session(store, { mode: 'today', autoAdvance: { setTimer: (run) => timers.push(run) } });
    await advanceTo(session, isMultipleChoice);
    const position = session.view.position;
    await answerCard(session);
    expect(session.view.state).toBe('feedback');
    expect(timers).toHaveLength(1);
    timers.shift()!();
    expect(session.view.state).toBe('presenting');
    expect(session.view.position).toBe(position + 1);
  });

  it('presents all six legacy prompts through the selector', async () => {
    const e = fresh();
    const { store } = await teachDay(e);
    const seen = new Set<string>();
    // Practice of words already met, the same day, until they settle and every format turns up.
    for (let round = 0; round < 8 && seen.size < 5; round++) {
      const session = await e.session(store, { mode: 'review-all', seed: round + 1 });
      for (const prompt of await finish(session)) seen.add(prompt);
    }
    e.clock.advance(DAY);
    const rating = await e.session(store, { mode: 'today' });
    for (const prompt of await finish(rating)) seen.add(prompt);
    expect([...seen].sort()).toEqual(['hear', 'listen', 'meaning', 'pick', 'recognize', 'reverse']);
    await expectCacheMatchesLog(store);
  });
});

describe('learning store', () => {
  it('exports, merges and replaces the log', async () => {
    const e = fresh();
    const { store } = await teachDay(e);
    const backup = await store.exportBackup();
    expect(backup.events).toHaveLength(20);

    const other = environment();
    const target = other.store();
    await target.init();
    expect(await target.mergeBackup(backup)).toMatchObject({ added: 20 });
    expect(await target.mergeBackup(backup)).toMatchObject({ added: 0 });
    expect(target.status(itemOf(POOL_WORDS[0]))).toBe('learning');

    await target.replaceBackup({ ...backup, events: [] });
    expect(target.status(itemOf(POOL_WORDS[0]))).toBe('new');
    other.closeAll();
  });

  it('resets the development data on request', async () => {
    const e = fresh();
    const { store } = await teachDay(e);
    await store.resetLearningData();
    expect(store.status(itemOf(POOL_WORDS[0]))).toBe('new');
    expect(await log(store)).toHaveLength(0);
    expect(store.newLeftToday()).toBe(10);
  });

  it('reports tomorrow load and due counts', async () => {
    const e = fresh();
    const { store } = await teachDay(e);
    e.clock.advance(DAY);
    await finish(await e.session(store, { mode: 'today' }));
    const dues = POOL_WORDS.slice(0, 10).map((word) => {
      const state = store.state(itemOf(word));
      return state && state.state !== 'new' ? state.dueAt : 0;
    });
    // Just before the first of them falls due, all reviews due within 24 hours count.
    e.clock.set(Math.min(...dues) - 1);
    const expected = dues.filter((due) => due >= e.clock.now() && due < e.clock.now() + DAY).length;
    expect(expected).toBeGreaterThan(0);
    expect(store.dueByTomorrow()).toBe(expected);
    expect(store.tomorrowLoadFull()).toBe(false);
  });
});
