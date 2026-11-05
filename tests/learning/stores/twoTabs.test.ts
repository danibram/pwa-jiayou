import { afterEach, describe, expect, it } from 'vitest';
import { answerCard, channelBus, DAY, environment, finish, MORNING, until, type Env } from './fixtures';

let env: Env;
afterEach(() => env?.closeAll());

/** Teaches the pool on day 0 so that day 1 has first ratings pending. */
const teachDay0 = async () => {
  const setup = env.store();
  await finish(await env.session(setup, { mode: 'more-words' }));
  setup.close();
};

const twoTabsOnHoy = async () => {
  await teachDay0();
  env.clock.set(MORNING + DAY);
  const bus = channelBus();
  const a = env.store({ channel: bus.channel() });
  const b = env.store({ channel: bus.channel() });
  const tabA = await env.session(a, { mode: 'today' });
  await tabA.idle();
  // Tab B opens Hoy: it resumes the session tab A stored.
  const tabB = await env.session(b, { mode: 'today' });
  expect(tabB.sessionId()).toBe(tabA.sessionId());
  const itemId = tabA.view.selection!.itemId;
  expect(tabB.view.selection!.itemId).toBe(itemId);
  return { a, b, tabA, tabB, itemId };
};

describe('one session open in two tabs', () => {
  it('rates a card once when the second tab answers before the first tab\'s write reaches it', async () => {
    env = environment();
    const { a, tabA, tabB, itemId } = await twoTabsOnHoy();
    tabA.actions.reveal();
    tabA.actions.selfAssess('good');
    await tabA.idle();
    // Same tick as A's commit: B has not heard of it yet and answers the same card.
    tabB.actions.reveal();
    tabB.actions.selfAssess('good');
    await tabB.idle();

    await a.reload();
    const attempts = a.events().filter((event) => event.itemId === itemId && event.type !== 'exposure' && event.occurredAt >= MORNING + DAY);
    expect(attempts.map((event) => event.type)).toEqual(['scheduled-review']);
    // B took the stored session and moved on with it.
    expect(tabB.view.position).toBe(tabA.view.position + (tabA.view.state === 'feedback' ? 1 : 0));
    expect(tabB.view.state).toBe('presenting');
    expect(tabB.view.selection?.itemId).not.toBe(itemId);
  });

  it('moves the second tab on when the first tab\'s write reaches it first', async () => {
    env = environment();
    const { a, tabA, tabB, itemId } = await twoTabsOnHoy();
    tabA.actions.reveal();
    tabA.actions.selfAssess('good');
    await tabA.idle();
    await until(() => tabB.view.selection?.itemId !== itemId);
    tabB.actions.reveal();
    tabB.actions.selfAssess('good');
    await tabB.idle();
    await a.reload();
    const attempts = a.events().filter((event) => event.itemId === itemId && event.type !== 'exposure' && event.occurredAt >= MORNING + DAY);
    expect(attempts).toHaveLength(1);
  });

  it('writes one practice event when both tabs answer the same practice card', async () => {
    env = environment();
    await teachDay0();
    // Still day 0: every word waits for tomorrow, so Repasar todo only writes practice, which
    // leaves the cached state as it was and gives the state check nothing to catch.
    const bus = channelBus();
    const a = env.store({ channel: bus.channel() });
    const b = env.store({ channel: bus.channel() });
    const tabA = await env.session(a, { mode: 'review-all' });
    await tabA.idle();
    const tabB = await env.session(b, { mode: 'review-all' });
    expect(tabB.sessionId()).toBe(tabA.sessionId());
    const selection = tabA.view.selection!;
    expect(selection.kind).toBe('exercise');
    const exerciseId = selection.kind === 'exercise' ? selection.exercise.id : '';
    expect(tabB.view.selection?.itemId).toBe(selection.itemId);

    await answerCard(tabA);
    // Same tick as A's commit: B has not heard of it yet.
    await answerCard(tabB);

    await a.reload();
    const forCard = a.events().filter((event) => event.type !== 'exposure' && event.type !== 'attempt-voided' && event.exercise.id === exerciseId);
    expect(forCard.map((event) => event.type)).toEqual(['practice']);
    // B dropped its answer and took the stored session.
    expect(tabB.view.state).toBe('presenting');
    expect(tabB.view.position).toBe(1);
  });

  it('stops a session when another tab resets the progress', async () => {
    env = environment();
    const bus = channelBus();
    const a = env.store({ channel: bus.channel() });
    const b = env.store({ channel: bus.channel() });
    await a.init();
    const tabB = await env.session(b, { mode: 'more-words' });
    expect(tabB.view.state).toBe('presenting');
    await a.resetLearningData();
    await until(() => tabB.view.state === 'error');
    expect(tabB.view.error).toEqual({ message: 'Se ha borrado el progreso en otra pestaña. Vuelve al inicio.', retryable: false });
    tabB.actions.continue();
    await tabB.idle();
    await b.reload();
    expect(b.events()).toHaveLength(0);
    expect(tabB.view.state).toBe('error');
  });
});
