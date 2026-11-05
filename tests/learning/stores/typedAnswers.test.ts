import { afterEach, describe, expect, it } from 'vitest';
import { validateAttemptEvent } from '../../../src/domain/learning/evaluation';
import type { LearningEvent } from '../../../src/domain/learning/types';
import type { LearningSession } from '../../../src/stores/learningSessionStore';
import type { LearningStore } from '../../../src/stores/learningStore';
import { DAY, environment, finish, itemOf, POOL_WORDS, type Env } from './fixtures';

let env: Env;
afterEach(() => env?.closeAll());

const word = POOL_WORDS[0];
const item = itemOf(word);

const TYPED_PINYIN = ['pinyin-from-characters', 'pinyin-from-gloss'];

/**
 * Takes the first pool word up the practice ladder through real sessions: taught and practised on
 * day 0, rated the next day, then practised on its own until a session opens on a typed reading.
 * Each correct answer climbs a rung. Without speech, the audio kinds never come up.
 */
const typedCard = async (): Promise<{ store: LearningStore; session: LearningSession }> => {
  env = environment();
  const store = env.store({ speechAvailable: () => false });
  await finish(await env.session(store, { mode: 'today' }));
  env.clock.advance(DAY);
  await finish(await env.session(store, { mode: 'today' }));
  for (let round = 0; round < 4; round++) {
    const session = await env.session(store, { mode: 'word', scope: { kind: 'item', itemId: item }, resume: false });
    const selection = session.view.selection;
    if (selection?.kind === 'exercise' && TYPED_PINYIN.includes(selection.prompt)) return { store, session };
    await finish(session);
  }
  throw new Error('The word never reached a typed reading');
};

const shownExercise = (session: LearningSession) => {
  const selection = session.view.selection;
  if (selection?.kind !== 'exercise') throw new Error('No exercise on screen');
  return selection;
};

type AttemptEvent = Extract<LearningEvent, { type: 'practice' | 'scheduled-review' | 'invalid-attempt' }>;
const attemptEvents = (store: LearningStore): AttemptEvent[] =>
  store.events().filter((event): event is AttemptEvent => event.itemId === item && event.type !== 'exposure' && event.type !== 'attempt-voided');

describe('typed answers in the session controller', () => {
  it('opens a typed reading card once the word has climbed the ladder', async () => {
    const { store, session } = await typedCard();
    const selection = shownExercise(session);
    expect(selection.exercise).toMatchObject({ format: 'free-recall', grading: 'automatic', rubric: { id: 'typed-pinyin' } });
    expect(selection.exercise.accepted?.map((entry) => entry.id)).toEqual([word.id]);
    // Three autonomous correct answers came first, one per rung.
    const correct = attemptEvents(store).filter((event) => event.type !== 'invalid-attempt' && event.evaluation.outcome === 'correct');
    expect(correct.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps the card open and records nothing when the text cannot be read', async () => {
    const { store, session } = await typedCard();
    const before = store.events().length;
    const draft = (await store.runtime().repo.loadAll()).session;

    session.actions.answer({ answer: 'ba8 ba' });
    expect(session.view.inputError).toBe('No hay tono 8. Usa del 1 al 4, y 5 o 0 para el tono neutro.');
    session.actions.answer({ answer: '爸爸' });
    expect(session.view.inputError).toBe('«爸» no se usa en pinyin. Escribe letras y tonos, como ni3 hao3 o nǐ hǎo.');
    await session.idle();

    expect(session.view.state).toBe('presenting');
    expect(session.view.actions).toEqual([]);
    expect(store.events()).toHaveLength(before);
    expect((await store.runtime().repo.loadAll()).session).toEqual(draft);
    // Punctuation and blank text are not answers either.
    session.actions.answer({ answer: "'-" });
    expect(session.view.inputError).not.toBeNull();
    session.actions.answer({ answer: '   ' });
    await session.idle();
    expect(store.events()).toHaveLength(before);
    expect(session.view.state).toBe('presenting');
  });

  it('records a correct reading as practice the validator accepts, with the accepted entries', async () => {
    const { store, session } = await typedCard();
    const selection = shownExercise(session);
    // The stored queue keeps the accepted entries, so a resumed card grades the same way.
    await session.idle();
    const stored = await store.runtime().repo.loadAll();
    expect(stored.session?.queue[stored.session.position].exercise?.accepted).toEqual(selection.exercise.accepted);

    session.actions.answer({ answer: 'ba8' });
    expect(session.view.inputError).not.toBeNull();
    session.actions.answer({ answer: 'ba4 ba5' });
    expect(session.view.inputError).toBeNull();
    await session.idle();

    expect(session.view.feedback).toEqual({ outcome: 'correct', rating: null, recorded: 'practice' });
    const event = attemptEvents(store).at(-1)!;
    expect(event.type).toBe('practice');
    if (event.type !== 'practice') return;
    expect(event.evaluation).toEqual({ outcome: 'correct' });
    expect(event.actions).toEqual([
      { type: 'answer', at: expect.any(Number), answer: 'ba4 ba5', selectedOptionId: null, evaluation: { outcome: 'correct' } },
    ]);
    expect(event.exercise.accepted).toEqual(selection.exercise.accepted);
    expect(event.evidence).toMatchObject([{ skill: selection.exercise.skill, evaluation: { outcome: 'correct' }, assisted: false }]);
    expect(validateAttemptEvent(event)).toEqual([]);
  });

  it('records a wrong reading as incorrect practice that the validator regrades to the same result', async () => {
    const { store, session } = await typedCard();
    // A wrong syllable fails both readings: tones count from the characters, only syllables from the Spanish.
    session.actions.answer({ answer: 'bo4 ba5' });
    await session.idle();
    expect(session.view.feedback).toEqual({ outcome: 'incorrect', rating: null, recorded: 'practice' });
    const event = attemptEvents(store).at(-1)!;
    expect(event).toMatchObject({ type: 'practice', evaluation: { outcome: 'incorrect' } });
    expect(event.type === 'practice' && event.actions[0]).toMatchObject({ answer: 'bo4 ba5', evaluation: { outcome: 'incorrect' } });
    expect(validateAttemptEvent(event)).toEqual([]);

    // A screen that claimed the wrong reading was right would be caught by the regrading.
    const forged = { ...event, evaluation: { outcome: 'correct' }, actions: event.type === 'practice' ? [{ ...event.actions[0], evaluation: { outcome: 'correct' } }] : [] } as LearningEvent;
    expect(validateAttemptEvent(forged).map((error) => error.code)).toEqual(['evaluation-mismatch']);
  });

  it('records No lo sé as an unanswered practice', async () => {
    const { store, session } = await typedCard();
    session.actions.answer({ answer: null });
    await session.idle();
    expect(session.view.feedback).toEqual({ outcome: 'incorrect', rating: null, recorded: 'practice' });
    const event = attemptEvents(store).at(-1)!;
    expect(event).toMatchObject({ type: 'practice', evaluation: { outcome: 'unanswered' } });
    expect(validateAttemptEvent(event)).toEqual([]);
  });

  it('labels a resumed typed card with its kind', async () => {
    const { store, session } = await typedCard();
    const selection = shownExercise(session);
    await session.idle();
    store.close();
    const resumed = await env.session(env.store({ speechAvailable: () => false }), { mode: 'word', scope: { kind: 'item', itemId: item } });
    const again = shownExercise(resumed);
    expect(again.exercise.id).toBe(selection.exercise.id);
    expect(again.prompt).toBe(selection.prompt);
    expect(TYPED_PINYIN).toContain(again.prompt);
    expect(again.exercise.accepted).toEqual(selection.exercise.accepted);
  });
});
