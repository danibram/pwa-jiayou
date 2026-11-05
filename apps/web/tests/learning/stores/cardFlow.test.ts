import { afterEach, describe, expect, it } from 'vitest';
import type { LearningSession } from '../../../src/stores/learningSessionStore';
import { advanceTo, answerCard, environment, isMultipleChoice, rightOption, until, wrongOption, type Env } from './fixtures';

let env: Env;
afterEach(() => env?.closeAll());

const isTeach = (session: LearningSession) => session.card()?.intent === 'teach';

/**
 * Every card moves through one step at a time. These tests pin the transitions a stray tap, a key
 * and a timer can race on, so no card is skipped or shown in a step it never reached.
 */
describe('card flow', () => {
  it('a second continue meant for the answered card does not skip the teaching card after it', async () => {
    env = environment();
    const store = env.store();
    const session = await env.session(store, { mode: 'more-words' });
    let seen = 0;
    for (let guard = 0; guard < 60 && session.view.state !== 'finished'; guard++) {
      if (session.view.state === 'presenting') {
        if (isTeach(session)) {
          session.actions.continue(session.view.cardKey);
          await session.idle();
        } else await answerCard(session, 'wrong');
        continue;
      }
      expect(session.view.state).toBe('feedback');
      const key = session.view.cardKey;
      const at = session.view.position;
      const events = store.events().length;
      // The tap on Continuar and the countdown both fire for the same answered card.
      session.actions.continue(key);
      session.actions.continue(key);
      await session.idle();
      expect(session.view.position).toBe(at + 1);
      expect(store.events()).toHaveLength(events);
      if (isTeach(session)) seen++;
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('opens a new word on the question first, and the lesson only when asked', async () => {
    env = environment();
    const session = await env.session(env.store(), { mode: 'more-words' });
    expect(session.view.lesson).toEqual({ mode: 'ask', again: false });
    // A tap meant for the card before does not open this one.
    session.actions.openLesson('stale');
    expect(session.view.lesson?.mode).toBe('ask');
    session.actions.openLesson(session.view.cardKey);
    expect(session.view.lesson).toEqual({ mode: 'open', again: false });
    expect(session.view.canClaimKnown).toBe(false);
    // A claim after the answer was on screen is refused.
    session.actions.knowIt(session.view.cardKey);
    await session.idle();
    expect(session.card()?.intent).toBe('teach');
    const first = session.view.cardKey;
    session.actions.continue(first);
    await session.idle();
    // The next word starts closed again, under a new key.
    expect(isTeach(session)).toBe(true);
    expect(session.view.cardKey).not.toBe(first);
    expect(session.view.lesson).toEqual({ mode: 'ask', again: false });
  });

  it('says a reteach is a word seen before and shows it open', async () => {
    env = environment();
    const store = env.store();
    const session = await env.session(store, { mode: 'more-words' });
    await advanceTo(session, (s) => s.card()?.intent === 'practice');
    session.actions.answer({ answer: null, optionId: null });
    await session.idle();
    await advanceTo(session, (s) => s.card()?.reason === 'teach-again');
    expect(session.view.lesson).toEqual({ mode: 'open', again: true });
  });

  it('checks "Ya la sé" with the meaning among options, and a right pick moves straight on', async () => {
    env = environment();
    const store = env.store();
    const session = await env.session(store, { mode: 'more-words' });
    const itemId = session.view.selection!.itemId;
    session.actions.knowIt(session.view.cardKey);
    await session.idle();
    expect(session.card()?.intent).toBe('already-known-check');
    expect(session.view.claimedCheck).toBe(true);
    expect(session.view.selection).toMatchObject({ kind: 'exercise', prompt: 'recognize' });
    expect(session.view.revealed).toBe(false);
    const at = session.view.position;
    session.actions.answer({ optionId: rightOption(session) });
    await session.idle();
    expect(store.history(itemId).at(-1)?.event).toMatchObject({ type: 'scheduled-review', basis: 'already-known', rating: 'good' });
    expect(session.view.state).toBe('presenting');
    expect(session.view.position).toBe(at + 1);
    expect(session.view.claimedCheck).toBe(false);
  });

  it('a wrong pick on the "Ya la sé" check stops on the answer and teaches the word again', async () => {
    env = environment();
    const store = env.store();
    const session = await env.session(store, { mode: 'more-words' });
    const itemId = session.view.selection!.itemId;
    session.actions.knowIt(session.view.cardKey);
    await session.idle();
    session.actions.answer({ optionId: wrongOption(session) });
    session.actions.answer({ answer: null, optionId: null });
    await session.idle();
    expect(session.view.state).toBe('feedback');
    expect(session.view.after).toBe('wait');
    expect(store.history(itemId).at(-1)?.event).toMatchObject({ type: 'practice' });
    await advanceTo(session, (s) => s.card()?.itemId === itemId && s.card()?.reason === 'teach-again');
  });

  it('shows a right first answer for a moment, then moves on by itself', async () => {
    env = environment();
    const store = env.store();
    const session = await env.session(store, { mode: 'more-words', flashMs: 30 });
    await advanceTo(session, isMultipleChoice);
    const at = session.view.position;
    session.actions.answer({ optionId: rightOption(session) });
    await until(() => session.view.state === 'feedback');
    expect(session.view.after).toBe('flash');
    await session.idle();
    expect(session.view.state).toBe('presenting');
    expect(session.view.position).toBe(at + 1);
  });

  it('a tap during the flash and the flash itself move on once', async () => {
    env = environment();
    const store = env.store();
    const session = await env.session(store, { mode: 'more-words', flashMs: 30 });
    await advanceTo(session, isMultipleChoice);
    const at = session.view.position;
    session.actions.answer({ optionId: rightOption(session) });
    await until(() => session.view.state === 'feedback');
    session.actions.continue(session.view.cardKey);
    await session.idle();
    expect(session.view.position).toBe(at + 1);
  });

  it('a paused flash waits for Continuar', async () => {
    env = environment();
    const store = env.store();
    const session = await env.session(store, { mode: 'more-words', flashMs: 30 });
    await advanceTo(session, isMultipleChoice);
    session.actions.answer({ optionId: rightOption(session) });
    await until(() => session.view.state === 'feedback');
    session.actions.pause();
    await session.idle();
    session.actions.resume();
    expect(session.view.state).toBe('feedback');
  });

  it('stops after a miss until Continuar', async () => {
    env = environment();
    const store = env.store();
    const session = await env.session(store, { mode: 'more-words' });
    await advanceTo(session, isMultipleChoice);
    session.actions.answer({ answer: null, optionId: null });
    await session.idle();
    expect(session.view.state).toBe('feedback');
    expect(session.view.after).toBe('wait');
  });
});
