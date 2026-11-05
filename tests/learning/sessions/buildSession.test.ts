import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildSession,
  DEFAULT_SESSION_SETTINGS,
  markAlreadyKnown,
  requeueAfterAgain,
  seededShuffle,
  type PlannedCard,
  type SessionPlan,
} from '../../../src/domain/learning/sessions';
import { effectiveItemEvents, eligibleFromEvents } from '../../../src/domain/learning/scheduler';
import { STUDY_RULES, type ItemId, type LearningEvent } from '../../../src/domain/learning/types';
import { exposure, practice, review } from '../scheduler/fixtures';
import {
  char,
  CONFIG,
  fresh,
  HOUR,
  input,
  NOW,
  on,
  poolOf,
  reviewed,
  statesOf,
  TODAY,
  TOMORROW,
  word,
  words,
  YESTERDAY,
} from './fixtures';

const intents = (plan: SessionPlan) => plan.cards.map((card) => card.intent);
const ofItem = (cards: readonly PlannedCard[], itemId: ItemId) => cards.filter((card) => card.itemId === itemId);

/** Teaching exposures, each followed by a correct practice, `hour` UTC on `days` from 2026-11-05. */
const taughtAndPassed = (ids: readonly ItemId[], hour: number, days = 0): LearningEvent[] =>
  ids.flatMap((itemId, i) => [
    exposure({ id: `teach-${itemId}-${days}`, itemId, occurredAt: on(hour, days) + i * 1000 }),
    practice({ id: `pass-${itemId}-${days}`, itemId, occurredAt: on(hour, days) + i * 1000 + 500 }),
  ]);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('work is counted in cards', () => {
  it('ten new words make twenty cards, not ten exercises', () => {
    const ids = words(1, 10);
    const plan = buildSession(input({ pool: poolOf(ids) }));
    expect(plan.counts).toMatchObject({ cards: 20, teach: 10, practice: 10, scheduled: 0, newItems: 10 });
    for (const id of ids) {
      const [teach, practiced] = ofItem(plan.cards, id);
      expect(teach).toEqual({ itemId: id, intent: 'teach', reason: 'new' });
      expect(practiced).toEqual({ itemId: id, intent: 'practice', reason: 'new-practice' });
      expect(plan.cards.indexOf(teach)).toBeLessThan(plan.cards.indexOf(practiced));
    }
  });

  it('gives new words only the room due reviews leave, two cards each', () => {
    const due = words(1, 15);
    const unseen = words(100, 10);
    const plan = buildSession(input({
      pool: poolOf([...due, ...unseen]),
      states: statesOf(...due.map((id, i) => reviewed(id, on(6) - i * HOUR))),
    }));
    // 30 cards: 15 reviews and 7 pairs is 29; an eighth pair would be 31.
    expect(plan.counts).toMatchObject({ scheduled: 15, teach: 7, practice: 7, cards: 29 });
    expect(plan.leftOut.filter((left) => left.reason === 'new-budget-session').map((left) => left.itemId)).toEqual(unseen.slice(7));
  });

  it('weaves new words between reviews: three reviews, a group taught, its practice', () => {
    const due = words(1, 6);
    const unseen = words(100, 3);
    const plan = buildSession(input({ pool: poolOf([...due, ...unseen]), states: statesOf(...due.map((id) => reviewed(id, on(6)))) }));
    expect(intents(plan)).toEqual([
      'scheduled', 'scheduled', 'scheduled',
      'teach', 'teach', 'teach',
      'practice', 'practice', 'practice',
      'scheduled', 'scheduled', 'scheduled',
    ]);
    // The practice never opens on the word just taught.
    expect(plan.cards[6].itemId).not.toBe(unseen[2]);
  });
});

describe('priority', () => {
  it('puts learning steps first, then reviews by due time, then first ratings', () => {
    const plan = buildSession(input({
      pool: poolOf([word(1), word(2), word(3), word(4), word(5)]),
      states: statesOf(
        reviewed(word(1), on(20)),
        reviewed(word(2), on(8, -2)),
        reviewed(word(3), on(8), 'relearning'),
        fresh(word(4), TODAY),
        // A step due later today keeps its hour.
        reviewed(word(5), on(10), 'learning'),
      ),
    }));
    expect(plan.cards).toEqual([
      { itemId: word(3), intent: 'scheduled', reason: 'learning-step' },
      { itemId: word(2), intent: 'scheduled', reason: 'due-review' },
      { itemId: word(1), intent: 'scheduled', reason: 'due-review' },
      { itemId: word(4), intent: 'scheduled', reason: 'first-rating' },
    ]);
  });

  it('a full session leaves out first ratings before overdue reviews', () => {
    const overdue = words(1, 20);
    const firsts = words(100, 15);
    const plan = buildSession(input({
      pool: poolOf([...firsts, ...overdue]),
      states: statesOf(...overdue.map((id) => reviewed(id, on(8, -1))), ...firsts.map((id) => fresh(id, TODAY))),
    }));
    expect(plan.cards.filter((card) => card.reason === 'due-review')).toHaveLength(20);
    expect(plan.cards.filter((card) => card.reason === 'first-rating')).toHaveLength(10);
    expect(plan.leftOut.every((left) => firsts.includes(left.itemId) && left.reason === 'work-limit')).toBe(true);
  });

  it('a topic or Más palabras teaches nothing while a pending word is left out of the plan', () => {
    const inTopic = words(1, 2);
    const outside = word(50);
    const unseen = words(100, 3);
    const pool = [...poolOf([...inTopic, ...unseen], { topicIds: ['comida'] }), ...poolOf([outside], { topicIds: ['viajes'] })];
    const states = statesOf(...inTopic.map((id) => reviewed(id, on(7))), reviewed(outside, on(7)));
    const topic = buildSession(input({ mode: 'topic', scope: { kind: 'topics', topicIds: ['comida'] }, pool, states }));
    // Its own pending words still come first.
    expect(topic.cards).toEqual(inTopic.map((itemId) => ({ itemId, intent: 'scheduled', reason: 'due-review' })));
    expect(topic.leftOut).toEqual(unseen.map((itemId) => ({ itemId, reason: 'pending-elsewhere' })));

    // Más palabras covers everything pending, so with room it teaches.
    const more = buildSession(input({ mode: 'more-words', pool, states }));
    expect(more.counts).toMatchObject({ scheduled: 3, newItems: 3 });
    // When the room runs out before the pending words do, it teaches nothing.
    const crowded = buildSession(input({ mode: 'more-words', pool, states, settings: { ...DEFAULT_SESSION_SETTINGS, workLimit: 2 } }));
    expect(crowded.counts).toMatchObject({ scheduled: 2, newItems: 0 });
    expect(crowded.leftOutCounts['pending-elsewhere']).toBe(3);

    // Once the outside word is no longer pending, the topic teaches again.
    const cleared = buildSession(input({
      mode: 'topic',
      scope: { kind: 'topics', topicIds: ['comida'] },
      pool,
      states: statesOf(...inTopic.map((id) => reviewed(id, on(7))), reviewed(outside, on(9, 3))),
    }));
    expect(cleared.counts.newItems).toBe(3);
  });

  it('a topic does not displace due reviews to introduce new words', () => {
    const due = words(1, 25);
    const unseen = words(100, 10);
    const plan = buildSession(input({
      mode: 'topic',
      scope: { kind: 'topics', topicIds: ['comida'] },
      pool: [...poolOf([...due, ...unseen], { topicIds: ['comida'] }), ...poolOf(words(200, 5), { topicIds: ['viajes'] })],
      states: statesOf(...due.map((id) => reviewed(id, on(7)))),
    }));
    expect(plan.counts.scheduled).toBe(25);
    expect(plan.counts.newItems).toBe(2);
    expect(plan.leftOutCounts['work-limit']).toBe(0);
    expect(plan.leftOutCounts['new-budget-session']).toBe(8);
    expect(plan.cards.some((card) => card.itemId >= word(200))).toBe(false);

    // With more due reviews than room, reviews fill the session and no word is taught.
    const crowded = buildSession(input({
      mode: 'topic',
      scope: { kind: 'topics', topicIds: ['comida'] },
      pool: poolOf([...words(1, 35), ...unseen], { topicIds: ['comida'] }),
      states: statesOf(...words(1, 35).map((id) => reviewed(id, on(7)))),
    }));
    expect(crowded.counts).toMatchObject({ scheduled: 30, teach: 0 });
    expect(crowded.leftOutCounts['work-limit']).toBe(5);
  });

  it('fills a topic with practice of met words once due and new ones are in', () => {
    const met = words(1, 4);
    const plan = buildSession(input({
      mode: 'topic',
      scope: { kind: 'topics', topicIds: ['comida'] },
      pool: poolOf([...met, word(100)], { topicIds: ['comida'] }),
      states: statesOf(reviewed(met[0], on(7)), ...met.slice(1).map((id) => reviewed(id, on(9, 5)))),
    }));
    expect(plan.counts).toMatchObject({ scheduled: 1, teach: 1, practice: 4 });
    expect(plan.cards.filter((card) => card.reason === 'seen').map((card) => card.itemId)).toEqual(met.slice(1));
  });

  it('Hoy and Más palabras stop after new words: no practice filler', () => {
    const plan = buildSession(input({ mode: 'more-words', pool: poolOf([word(1)]), states: statesOf(reviewed(word(1), on(9, 5))) }));
    expect(plan.cards).toEqual([]);
  });
});

describe('new-word budget', () => {
  it('respects teaching exposures already made today', () => {
    const before = words(50, 8);
    const unseen = words(100, 15);
    // Taught yesterday for the first time and again today: it spent yesterday's budget, not today's.
    const reTaught = word(60);
    const events = [
      ...taughtAndPassed(before, 7),
      exposure({ id: 'teach-60-yesterday', itemId: reTaught, occurredAt: on(18, -1) }),
      exposure({ id: 'teach-60-today', itemId: reTaught, occurredAt: on(7) }),
    ];
    const pool = poolOf([...before, reTaught, ...unseen]);
    const states = statesOf(...before.map((id) => fresh(id, TOMORROW)), fresh(reTaught));

    const today = buildSession(input({ pool, states, events }));
    expect(today.counts.taughtToday).toBe(8);
    // Hoy's share is 10; the word taught yesterday comes back free.
    expect(today.counts.newItems).toBe(2);
    expect(today.cards.filter((card) => card.intent === 'teach').map((card) => card.reason)).toEqual(['reteach', 'new', 'new']);
    expect(today.counts.newLeftAfter).toBe(0);
    expect(today.leftOutCounts['new-budget-day']).toBe(13);

    // Más palabras reaches the daily cap of 20: twelve left, ten per session.
    const more = buildSession(input({ mode: 'more-words', pool, states, events }));
    expect(more.counts.newItems).toBe(9);
    expect(more.counts.teach).toBe(10);
    expect(more.counts.newLeftAfter).toBe(3);
  });

  it('does not spend it on already-known exposures', () => {
    const known = words(1, 10);
    const unseen = words(100, 10);
    const events = known.flatMap((itemId, i) => [
      exposure({ id: `known-${i}`, itemId, occurredAt: on(7) + i, reason: 'already-known' }),
      { ...review({ id: `check-${i}`, itemId, occurredAt: on(7) + i + 1, rating: 'good', configId: CONFIG }), basis: 'already-known' } as LearningEvent,
    ]);
    const plan = buildSession(input({
      pool: poolOf([...known, ...unseen]),
      states: statesOf(...known.map((id) => reviewed(id, on(9, 3)))),
      events,
    }));
    expect(plan.counts.taughtToday).toBe(0);
    expect(plan.counts.newItems).toBe(10);
  });

  it('"Ya la sé" on a teach card turns it into a check and gives the budget back', () => {
    const plan = buildSession(input({ pool: poolOf(words(1, 3)) }));
    const at = plan.cards.findIndex((card) => card.itemId === word(1) && card.intent === 'teach');
    const claimed = markAlreadyKnown(plan, at, word(1));
    expect(ofItem(claimed.cards, word(1))).toEqual([{ itemId: word(1), intent: 'already-known-check', reason: 'claimed-known' }]);
    expect(claimed.counts).toMatchObject({ cards: 5, newItems: 2, newLeftAfter: plan.counts.newLeftAfter + 1, alreadyKnownCheck: 1 });
  });

  it('stops new words when tomorrow is full, and only then', () => {
    const load = words(1, STUDY_RULES.tomorrowLoadLimit);
    // Due tomorrow morning: inside the next 24 hours, not pending today.
    const states = statesOf(...load.map((id) => reviewed(id, on(6, 1))));
    const full = buildSession(input({ pool: poolOf([...load, word(100), word(101)]), states }));
    expect(full.counts).toMatchObject({ tomorrowLoadFull: true, cards: 0, newItems: 0 });
    expect(full.leftOut).toEqual([
      { itemId: word(100), reason: 'tomorrow-load' },
      { itemId: word(101), reason: 'tomorrow-load' },
    ]);

    const oneLess = buildSession(input({ pool: poolOf([...load.slice(1), word(100)]), states }));
    expect(oneLess.counts).toMatchObject({ tomorrowLoadFull: false, newItems: 1 });
  });
});

describe('first rating', () => {
  it('a word taught and passed shows up the next local day as scheduled', () => {
    const id = word(1);
    const events = taughtAndPassed([id], 18, -1);
    const eligibleFrom = eligibleFromEvents(effectiveItemEvents(events, id));
    expect(eligibleFrom).toBe(TODAY);
    const states = statesOf(fresh(id, eligibleFrom));

    // Later on the day it was taught: nothing to do with it in Hoy.
    const sameDay = buildSession(input({ pool: poolOf([id]), states, events, now: on(22, -1) }));
    expect(sameDay.cards).toEqual([]);
    expect(sameDay.leftOut).toEqual([]);

    const nextDay = buildSession(input({ pool: poolOf([id]), states, events }));
    expect(nextDay.cards).toEqual([{ itemId: id, intent: 'scheduled', reason: 'first-rating' }]);
    expect(nextDay.today).toBe(TODAY);
  });
});

describe('requeue after Again', () => {
  it('brings the item back requeueGap cards later as practice', () => {
    const ids = words(1, 8);
    const plan = buildSession(input({ pool: poolOf(ids), states: statesOf(...ids.map((id) => reviewed(id, on(7)))) }));
    const next = requeueAfterAgain(plan, 0, ids[0]);
    expect(next.cards[1 + STUDY_RULES.requeueGap]).toEqual({ itemId: ids[0], intent: 'practice', reason: 'requeue' });
    expect(next.counts.cards).toBe(9);
    expect(next.counts.practice).toBe(1);
  });

  it('re-teaches after a failed first practice (P1)', () => {
    const plan = buildSession(input({ pool: poolOf([word(1)]) }));
    expect(plan.cards).toHaveLength(2);
    const next = requeueAfterAgain(plan, 1, word(1));
    expect(next.cards).toEqual([
      { itemId: word(1), intent: 'teach', reason: 'new' },
      { itemId: word(1), intent: 'practice', reason: 'new-practice' },
      { itemId: word(1), intent: 'teach', reason: 'teach-again' },
      { itemId: word(1), intent: 'practice', reason: 'teach-again' },
    ]);
    // Failing the second practice re-teaches again, within the per-item bound.
    const again = requeueAfterAgain(next, 3, word(1));
    expect(again.cards.slice(4).map((card) => card.intent)).toEqual(['teach', 'practice']);
    expect(requeueAfterAgain(again, 5, word(1))).toBe(again);
  });

  it('cannot grow a session past its cap, however many Agains', () => {
    const due = words(1, 12);
    const unseen = words(100, 9);
    let plan = buildSession(input({ pool: poolOf([...due, ...unseen]), states: statesOf(...due.map((id) => reviewed(id, on(7)))) }));
    const initial = plan.cards.length;
    // Again on every answered card, the added ones too.
    for (let position = 0; position < plan.cards.length; position++) {
      const card = plan.cards[position];
      if (card.intent !== 'teach') plan = requeueAfterAgain(plan, position, card.itemId);
    }
    expect(plan.cards.length).toBeLessThanOrEqual(initial + DEFAULT_SESSION_SETTINGS.requeueLimit);
    expect(plan.cards.length).toBeGreaterThan(initial);
    for (const id of [...due, ...unseen]) {
      const added = ofItem(plan.cards, id).filter((card) => card.reason === 'requeue' || (card.reason === 'teach-again' && card.intent === 'teach'));
      expect(added.length).toBeLessThanOrEqual(DEFAULT_SESSION_SETTINGS.requeuesPerItem);
    }
  });

  it('rejects a position that does not hold the item', () => {
    const plan = buildSession(input({ pool: poolOf([word(1)]) }));
    expect(() => requeueAfterAgain(plan, 1, word(2))).toThrow();
    expect(() => requeueAfterAgain(plan, 0, word(1))).toThrow('not answered');
  });
});

describe('modes', () => {
  it('Flojos only practises weak words, due ones included', () => {
    const weakDue = word(1);
    const weakLater = word(2);
    const steady = word(3);
    const events = [
      review({ id: 'miss-1', itemId: weakDue, occurredAt: on(10, -1), rating: 'again', configId: CONFIG }),
      review({ id: 'miss-2', itemId: weakLater, occurredAt: on(10, -3), rating: 'again', configId: CONFIG }),
      review({ id: 'hit-2', itemId: weakLater, occurredAt: on(10, -2), rating: 'good', configId: CONFIG }),
      review({ id: 'hit-3', itemId: steady, occurredAt: on(10, -2), rating: 'good', configId: CONFIG }),
    ];
    const plan = buildSession(input({
      mode: 'weak',
      pool: poolOf([weakDue, weakLater, steady, word(100)]),
      states: statesOf(reviewed(weakDue, on(8)), reviewed(weakLater, on(9, 2)), reviewed(steady, on(8))),
      events,
    }));
    expect(plan.cards).toEqual([
      { itemId: weakDue, intent: 'practice', reason: 'weak' },
      { itemId: weakLater, intent: 'practice', reason: 'weak' },
    ]);
  });

  it('Repasar todo rates what is pending and practises the rest of what was met', () => {
    const plan = buildSession(input({
      mode: 'review-all',
      pool: poolOf([word(1), word(2), word(3)]),
      states: statesOf(reviewed(word(1), on(9, 4)), reviewed(word(2), on(7))),
    }));
    expect(plan.cards).toEqual([
      { itemId: word(2), intent: 'scheduled', reason: 'due-review' },
      { itemId: word(1), intent: 'practice', reason: 'seen' },
    ]);
  });

  it('a single word is scheduled when pending, practised when not, taught when new', () => {
    const states = statesOf(reviewed(word(1), on(7)), reviewed(word(2), on(9, 4)), fresh(word(4), TOMORROW));
    // Today's budget is spent, but the learner chose this word.
    const events = taughtAndPassed(words(50, 20), 7);
    const pool = poolOf([word(1), word(2), word(3), word(4), ...words(50, 20)]);
    const one = (id: ItemId) => buildSession(input({ mode: 'word', scope: { kind: 'item', itemId: id }, pool, states, events })).cards;
    expect(one(word(1))).toEqual([{ itemId: word(1), intent: 'scheduled', reason: 'due-review' }]);
    expect(one(word(2))).toEqual([{ itemId: word(2), intent: 'practice', reason: 'chosen' }]);
    expect(one(word(3))).toEqual([
      { itemId: word(3), intent: 'teach', reason: 'new' },
      { itemId: word(3), intent: 'practice', reason: 'new-practice' },
    ]);
    // Taught and passed today: practice until tomorrow's first rating.
    expect(one(word(4))).toEqual([{ itemId: word(4), intent: 'practice', reason: 'chosen' }]);

    const missing = buildSession(input({ mode: 'word', scope: { kind: 'item', itemId: word(999) }, pool, states }));
    expect(missing.leftOut).toEqual([{ itemId: word(999), reason: 'not-in-pool' }]);
  });

  it('Trazos plans characters only, checks likely-known ones outside the budget', () => {
    const chars = ['4e00', '4e8c', '4e09', '56db', '4e94', '516d', '4e03', '516b', '4e5d', '5341'].map(char);
    const plan = buildSession(input({
      mode: 'strokes',
      pool: [
        ...poolOf([word(1)]),
        ...poolOf(chars.slice(0, 2), { likelyKnown: true }),
        ...poolOf(chars.slice(2)),
      ],
      states: statesOf(reviewed(word(1), on(7))),
    }));
    expect(plan.cards.every((card) => card.itemId.startsWith('character-writing:'))).toBe(true);
    expect(plan.counts).toMatchObject({ alreadyKnownCheck: 2, newItems: 8, teach: 8, practice: 8, scheduled: 0 });
    // Eight new characters a day; the likely-known ones do not take part of it.
    expect(plan.counts.newLeftAfter).toBe(0);
  });

  it('leaves out items whose content is not available', () => {
    const plan = buildSession(input({
      pool: [{ itemId: word(1), available: false }, { itemId: word(2), available: true }],
      states: statesOf(reviewed(word(1), on(7)), reviewed(word(2), on(7))),
    }));
    expect(plan.cards).toEqual([{ itemId: word(2), intent: 'scheduled', reason: 'due-review' }]);
    expect(plan.leftOut).toEqual([{ itemId: word(1), reason: 'content-unavailable' }]);
  });
});

describe('determinism', () => {
  const scenario = () => {
    const due = words(1, 9);
    const met = words(20, 8);
    return input({
      mode: 'topic',
      scope: { kind: 'topics', topicIds: ['casa'] },
      pool: poolOf([...due, ...met, ...words(100, 6)], { topicIds: ['casa'] }),
      states: statesOf(...due.map((id, i) => reviewed(id, on(8) - i * HOUR)), ...met.map((id) => reviewed(id, on(9, 6)))),
      events: [exposure({ id: 'old', itemId: word(100), occurredAt: on(9, -3) })],
    });
  };

  it('gives equal plans for equal input, without Math.random', () => {
    const random = vi.spyOn(Math, 'random');
    expect(buildSession(scenario())).toEqual(buildSession(scenario()));
    expect(buildSession({ ...scenario(), shuffle: seededShuffle(7) })).toEqual(buildSession({ ...scenario(), shuffle: seededShuffle(7) }));
    expect(random).not.toHaveBeenCalled();
  });

  it('a seeded shuffle changes the order, never the content, when everything fits', () => {
    const plain = buildSession(scenario());
    const shuffled = buildSession({ ...scenario(), shuffle: seededShuffle(7) });
    const key = (card: PlannedCard) => `${card.itemId}|${card.intent}|${card.reason}`;
    expect(shuffled.cards.map(key).sort()).toEqual(plain.cards.map(key).sort());
    expect(shuffled.counts).toEqual(plain.counts);
    expect(shuffled.cards).not.toEqual(plain.cards);
  });

  it('reads today from the day rule, not the machine clock', () => {
    expect(buildSession(scenario()).today).toBe(TODAY);
    expect(buildSession({ ...scenario(), now: on(23, -1) }).today).toBe(YESTERDAY);
    expect(NOW).toBe(on(9));
  });
});
