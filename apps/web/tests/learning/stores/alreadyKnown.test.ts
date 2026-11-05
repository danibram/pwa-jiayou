import { afterEach, describe, expect, it, vi } from 'vitest';
import { STUDY_RULES, type LearningEvent } from '@jiayou/learning/types';
import type { LearningSession } from '../../../src/stores/learningSessionStore';
import { advanceTo, environment, type Env } from './fixtures';

// The fixture pool has twelve words, fewer than the real cap, so the cap is lowered here.
vi.mock('@jiayou/learning/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@jiayou/learning/types')>();
  return { ...actual, STUDY_RULES: { ...actual.STUDY_RULES, alreadyKnownPerDay: 3 } };
});

let env: Env;
afterEach(() => env?.closeAll());

const isTeach = (session: LearningSession) => session.card()?.intent === 'teach';

/** Claims the teaching card on screen and passes its meaning check. */
const claim = async (session: LearningSession) => {
  session.actions.knowIt();
  await session.idle();
  expect(session.card()?.intent).toBe('already-known-check');
  session.actions.reveal();
  session.actions.selfAssess('good');
  await session.idle();
};

const claims = (events: readonly LearningEvent[]) =>
  events.filter((event) => event.type === 'exposure' && event.card.reason === 'already-known');

describe('"Ya la sé"', () => {
  it('goes from the first teaching card to the meaning check and rates it already known', async () => {
    env = environment();
    const store = env.store();
    const session = await env.session(store, { mode: 'more-words' });
    const teach = session.view.selection!;
    expect(teach.kind).toBe('exposure');
    expect(session.card()).toMatchObject({ intent: 'teach', reason: 'new', canClaimKnown: true });
    expect(session.view.canClaimKnown).toBe(true);

    await claim(session);
    const review = store.events().at(-1)!;
    expect(review).toMatchObject({ type: 'scheduled-review', basis: 'already-known', rating: 'good', itemId: teach.itemId });
    // The lesson was never recorded: only the claim and the check.
    expect(store.events().filter((event) => event.itemId === teach.itemId).map((event) => event.type)).toEqual(['exposure', 'scheduled-review']);
    expect(claims(store.events())).toHaveLength(1);
  });

  it('is not offered on a reteach after a failed practice', async () => {
    env = environment();
    const store = env.store();
    const session = await env.session(store, { mode: 'more-words' });
    session.actions.continue();
    await session.idle();
    // The practice right after the lesson: miss it, and the word is taught again later.
    await advanceTo(session, (s) => s.card()?.intent === 'practice');
    session.actions.answer({ answer: null, optionId: null });
    await session.idle();
    await advanceTo(session, (s) => s.card()?.reason === 'teach-again' && s.card()?.intent === 'teach');
    expect(session.card()?.canClaimKnown).toBe(false);
    expect(session.view.canClaimKnown).toBe(false);
    expect(session.view.claimsUsedUp).toBe(false);
    const before = store.events().length;
    session.actions.knowIt();
    await session.idle();
    expect(store.events()).toHaveLength(before);
  });

  it(`stops after ${STUDY_RULES.alreadyKnownPerDay} claims in a local day`, async () => {
    env = environment();
    const store = env.store();
    const today = await env.session(store, { mode: 'today' });
    for (let i = 0; i < STUDY_RULES.alreadyKnownPerDay; i++) {
      await advanceTo(today, isTeach);
      expect(today.view.canClaimKnown).toBe(true);
      await claim(today);
    }
    expect(claims(store.events())).toHaveLength(STUDY_RULES.alreadyKnownPerDay);

    const more = await env.session(store, { mode: 'more-words' });
    await advanceTo(more, isTeach);
    expect(more.card()).toMatchObject({ reason: 'new', canClaimKnown: false });
    expect(more.view.canClaimKnown).toBe(false);
    expect(more.view.claimsUsedUp).toBe(true);
    const before = store.events().length;
    more.actions.knowIt();
    await more.idle();
    expect(store.events()).toHaveLength(before);
  });
});

describe('self-assessment', () => {
  it('does nothing until the answer is revealed', async () => {
    env = environment();
    const store = env.store();
    const session = await env.session(store, { mode: 'more-words' });
    session.actions.knowIt();
    await session.idle();
    const before = store.events().length;
    session.actions.selfAssess('good');
    await session.idle();
    expect(store.events()).toHaveLength(before);
    expect(session.view.state).toBe('presenting');
    session.actions.reveal();
    session.actions.selfAssess('good');
    await session.idle();
    expect(store.events().at(-1)).toMatchObject({ type: 'scheduled-review', evaluatorVersion: 'learning-evaluator@3' });
  });
});
