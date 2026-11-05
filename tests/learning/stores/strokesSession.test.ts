import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { autoStrokeHint, STROKE_HINT } from '../../../src/components/learning/writing/hints';
import { contentReferenceForCharacter } from '../../../src/domain/learning/content/revision';
import type { ItemContent } from '../../../src/domain/learning/exercises';
import type { PoolItem } from '../../../src/domain/learning/sessions';
import type { AttemptAction, Hint, ItemId, LearningEvent } from '../../../src/domain/learning/types';
import { characterStore } from '../../../src/stores/characterStore';
import type { LearningSession } from '../../../src/stores/learningSessionStore';
import { characterItemId, characterOf, contentReferenceOf, createLearningStore, type LearningStore } from '../../../src/stores/learningStore';
import { DAY, environment, itemOf, POOL_WORDS, type Env } from './fixtures';

let env: Env;
afterEach(() => {
  env?.closeAll();
  characterStore.reset();
});

/** Four HSK 1 characters with their gloss sidecar merged, as Trazos shows them. */
const CHARS = ['爱', '八', '爸', '杯'].map((char) => {
  const row = characterStore.state.characters.find((candidate) => candidate.character === char);
  if (!row) throw new Error(`No character ${char}`);
  return row;
});
const charItems = CHARS.map((row) => characterItemId(row.character));
/** A word that shares 爸 with the character pool. Writing must never touch it. */
const DAD = POOL_WORDS[0];

const strokesEnv = () => {
  env = environment();
  const resolve = (itemId: ItemId): ItemContent | null => {
    const char = characterOf(itemId);
    if (char !== null) {
      const row = CHARS.find((candidate) => candidate.character === char);
      return row ? { kind: 'character', character: row } : null;
    }
    const word = env.words.get(itemId.slice('word-meaning:'.length));
    return word ? { kind: 'word', word } : null;
  };
  const pool = (): PoolItem[] => [
    { itemId: itemOf(DAD), available: true },
    ...charItems.map((itemId) => ({ itemId, available: true })),
  ];
  return env.store({ resolveContent: resolve, pool });
};

type Step = { hints?: Hint[]; mistakes: number };

/**
 * Plays the session: exposures continue, writing cards take `plan(itemId, stage)` (hints, then the
 * drawing), and every feedback moves on. Returns the stages seen, in order.
 */
const play = async (session: LearningSession, plan: (itemId: ItemId, stage: string) => Step) => {
  const seen: string[] = [];
  for (let guard = 0; guard < 100 && session.view.state !== 'finished'; guard++) {
    if (session.view.state === 'feedback') {
      session.actions.continue();
      continue;
    }
    expect(session.view.state).toBe('presenting');
    const selection = session.view.selection!;
    if (selection.kind === 'exposure') {
      seen.push(`watch:${characterOf(selection.itemId)}`);
      session.actions.continue();
    } else {
      const stage = selection.exercise.stage!;
      seen.push(`${stage}:${characterOf(selection.itemId)}`);
      const step = plan(selection.itemId, stage);
      for (const hint of step.hints ?? []) session.actions.hint(hint);
      session.actions.drawing({ mistakes: step.mistakes });
    }
    await session.idle();
  }
  expect(session.view.state).toBe('finished');
  return seen;
};

const attempts = (store: LearningStore, itemId: ItemId) =>
  store.events().filter((event): event is Exclude<LearningEvent, { type: 'exposure' | 'attempt-voided' }> =>
    event.itemId === itemId && event.type !== 'exposure' && event.type !== 'attempt-voided');

const drawingOf = (actions: readonly AttemptAction[]) => actions.find((action) => action.type === 'drawing');

describe('a Trazos session', () => {
  it('watches and traces new characters, then writes them from memory the next day, rated by mistakes and hints', async () => {
    const store = strokesEnv();
    await store.init();

    // Day 0: every new character is watched (the teaching exposure), then traced. Tracing never rates.
    const day0 = await env.session(store, { mode: 'strokes' });
    const firstDay = await play(day0, (itemId) => (itemId === charItems[0] ? { hints: [autoStrokeHint(1)], mistakes: 2 } : { mistakes: 0 }));
    expect(firstDay.filter((step) => step.startsWith('watch'))).toHaveLength(4);
    expect(firstDay.filter((step) => step.startsWith('trace'))).toHaveLength(4);
    expect(firstDay.some((step) => step.startsWith('memory'))).toBe(false);
    expect(store.events().some((event) => event.type === 'scheduled-review')).toBe(false);
    const traced = attempts(store, charItems[0])[0];
    expect(traced).toMatchObject({ type: 'practice', sessionMode: 'strokes', evaluation: { outcome: 'correct' } });
    expect(traced.exercise).toMatchObject({ skill: 'writing', format: 'writing', stage: 'trace', cue: 'characters' });
    expect(traced.actions.map((action) => action.type)).toEqual(['hint', 'drawing']);
    expect(drawingOf(traced.actions)).toMatchObject({ mistakes: 2 });
    // A trace that needed a stroke hint is not a pass: that character is taught again before its first rating.
    expect(store.state(charItems[0])).toMatchObject({ state: 'new', eligibleFrom: null });
    const again = await env.session(store, { mode: 'strokes', scope: { kind: 'item', itemId: charItems[0] } });
    expect(await play(again, () => ({ mistakes: 0 }))).toEqual([`watch:${CHARS[0].character}`, `trace:${CHARS[0].character}`]);
    for (const itemId of charItems) {
      expect(store.state(itemId)).toMatchObject({ state: 'new', eligibleFrom: '2026-11-06' });
      expect(store.status(itemId)).toBe('learning');
    }
    expect(store.pendingToday('character-writing')).toBe(0);

    // Day 1: each character is due, and writing it from memory is the card that rates it.
    env.clock.advance(DAY);
    expect(store.pendingToday('character-writing')).toBe(4);
    const day1 = await env.session(store, { mode: 'strokes' });
    const plans: Record<string, Step> = {
      [charItems[0]]: { mistakes: 0 },
      [charItems[1]]: { mistakes: 2 },
      [charItems[2]]: { mistakes: 3 },
      [charItems[3]]: { hints: [STROKE_HINT], mistakes: 0 },
    };
    const secondDay = await play(day1, (itemId, stage) => (stage === 'memory' ? plans[itemId] : { mistakes: 5 }));
    expect(secondDay.filter((step) => step.startsWith('memory'))).toHaveLength(4);

    const reviews = charItems.map((itemId) => attempts(store, itemId).find((event) => event.type === 'scheduled-review'));
    expect(reviews.map((event) => event && event.type === 'scheduled-review' && event.rating)).toEqual(['good', 'hard', 'again', 'again']);
    expect(reviews.map((event) => event && drawingOf(event.actions))).toMatchObject([{ mistakes: 0 }, { mistakes: 2 }, { mistakes: 3 }, { mistakes: 0 }]);
    expect(reviews[1]).toMatchObject({ evaluation: { outcome: 'correct' }, exercise: { stage: 'memory', cue: 'gloss' } });
    expect(reviews[2]).toMatchObject({ evaluation: { outcome: 'incorrect' } });
    expect(reviews[3]!.actions[0]).toMatchObject({ type: 'hint', hint: { revealsAnswer: true, value: 'stroke' } });
    expect(reviews[3]!.evidence[0]).toMatchObject({ skill: 'writing', assisted: true, mistakes: 0 });

    // Again brings the character back as tracing in the same session: practice, never a second rating.
    const requeued = secondDay.filter((step) => step.startsWith('trace'));
    expect(requeued.length).toBeGreaterThan(0);
    for (const itemId of [charItems[2], charItems[3]]) {
      const after = attempts(store, itemId).filter((event) => event.exercise.stage === 'trace' && event.localDay === '2026-11-06');
      expect(after.length).toBeGreaterThan(0);
      for (const event of after) expect(event.type).toBe('practice');
      expect(attempts(store, itemId).filter((event) => event.type === 'scheduled-review')).toHaveLength(1);
    }
    expect(store.status(charItems[2])).toBe('weak');
    expect(store.status(charItems[0])).toBe('review');

    // Writing never changes a word: 爸爸 shares 爸 and has no event or state.
    expect(store.events().some((event) => event.itemId === itemOf(DAD))).toBe(false);
    expect(store.state(itemOf(DAD))).toBeNull();
    expect(store.status(itemOf(DAD))).toBe('new');
  });

  it('never rates tracing, even with no mistakes on a character that is due', async () => {
    const store = strokesEnv();
    await store.init();
    await play(await env.session(store, { mode: 'strokes' }), () => ({ mistakes: 0 }));
    env.clock.advance(DAY);
    const day1 = await env.session(store, { mode: 'strokes' });
    // Miss the first memory card so its requeue is a trace of a character the session already rated.
    let missed = false;
    await play(day1, (_itemId, stage) => {
      if (stage === 'memory' && !missed) {
        missed = true;
        return { mistakes: 6 };
      }
      return { mistakes: 0 };
    });
    const traces = store.events().filter((event) => event.type !== 'exposure' && event.type !== 'attempt-voided' && event.exercise.stage === 'trace');
    expect(traces.length).toBeGreaterThan(4);
    expect(traces.every((event) => event.type === 'practice')).toBe(true);
  });
});

describe('character content in the learning store', () => {
  it('resolves a catalog character with its gloss merged and gives the c1 revision Trazos shows', () => {
    const store = createLearningStore({ channel: null, locks: null });
    const itemId = characterItemId('爱');
    expect(itemId).toBe('character-writing:char-7231');
    const content = store.content(itemId);
    expect(content).toMatchObject({ kind: 'character', character: { character: '爱', gloss: expect.any(String) } });
    expect(contentReferenceOf(content!)).toEqual(contentReferenceForCharacter(CHARS[0]));
    expect(contentReferenceOf(content!).contentRevision).toMatch(/^c1:[0-9a-f]{16}$/);
  });

  it('leaves a character outside HSK without content, so no session plans it', () => {
    const store = createLearningStore({ channel: null, locks: null });
    expect(store.content(characterItemId('喱'))).toBeNull();
    expect(store.inPool(characterItemId('喱'))).toBe(false);
  });

  it('puts the selected levels in the pool, with the topics that list each character', async () => {
    const store = createLearningStore({ indexedDB: new IDBFactory(), channel: null, locks: null, deviceId: () => 'device-a' });
    expect(store.inPool(characterItemId('爸'))).toBe(false);
    characterStore.selectLevels([1]);
    expect(store.inPool(characterItemId('爸'))).toBe(true);
    const runtime = await store.init();
    const dad = runtime.pool().find((item) => item.itemId === characterItemId('爸'));
    expect(dad?.topicIds).toEqual(expect.arrayContaining(['familia', 'personas']));
    const plan = store.previewPlan('strokes', { kind: 'topics', topicIds: ['personas'] })!;
    const named = [...plan.cards.map((card) => card.itemId), ...plan.leftOut.map((left) => left.itemId)];
    expect(named).toContain(characterItemId('爸'));
    expect(named).not.toContain(characterItemId('八'));
    store.close();
  });
});

describe('sessions of two modes', () => {
  it('keeps a paused Hoy session while a Trazos session starts and finishes', async () => {
    const store = strokesEnv();
    await store.init();

    const today = await env.session(store, { mode: 'today' });
    expect(today.view.selection).toMatchObject({ kind: 'exposure', itemId: itemOf(DAD) });
    today.actions.continue();
    await today.idle();
    const position = today.view.position;
    expect(position).toBeGreaterThan(0);
    expect(today.view.state).toBe('presenting');

    await play(await env.session(store, { mode: 'strokes' }), () => ({ mistakes: 0 }));
    expect(await store.activeSession('strokes')).toBeNull();
    expect((await store.activeSession('today'))?.id).toBe(today.sessionId());

    const resumed = await env.session(store, { mode: 'today' });
    expect(resumed.sessionId()).toBe(today.sessionId());
    expect(resumed.view.position).toBe(position);
  });
});
