import { beforeAll, describe, expect, it } from 'vitest';
import {
  addLocalDays,
  createScheduler,
  DEFAULT_SCHEDULER_CONFIG,
  isWeak,
  rebuildItem,
  type Scheduler,
} from '../../src/scheduler/index.ts';
import type { SessionScope } from '../../src/sessions/index.ts';
import { STUDY_RULES, type ItemId, type LocalDay, type SessionMode } from '../../src/types.ts';
import {
  createLearner,
  createWorld,
  DAY,
  daysBetween,
  firstTeachingsByDay,
  HOUR,
  madridZone,
  report,
  run,
  utcZone,
  wordIds,
  type ReviewRecord,
  type World,
} from './simulator.ts';

let scheduler: Scheduler;
beforeAll(async () => {
  scheduler = await createScheduler(DEFAULT_SCHEDULER_CONFIG);
});

const RATING_MODES: readonly SessionMode[] = ['today', 'more-words', 'topic'];
const max = (values: readonly number[]) => values.reduce((a, b) => Math.max(a, b), 0);

/** Bounds every session must keep, whatever the scenario. */
const expectSessionBounds = (world: World) => {
  const { workLimit, requeueLimit, requeuesPerItem } = world.settings;
  for (const s of world.sessions) {
    const where = `${s.mode} session on ${s.localDay}`;
    expect(s.initialCards, where).toBeLessThanOrEqual(workLimit);
    expect(s.finalCards, where).toBeLessThanOrEqual(workLimit + requeueLimit);
    expect(s.added, where).toBeLessThanOrEqual(requeueLimit);
    const perItem = new Map<ItemId, number>();
    for (const card of s.plan.cards) {
      if (card.reason === 'requeue' || (card.reason === 'teach-again' && card.intent === 'teach')) {
        perItem.set(card.itemId, (perItem.get(card.itemId) ?? 0) + 1);
      }
    }
    expect(max([...perItem.values()]), where).toBeLessThanOrEqual(requeuesPerItem);
    // The plan and the evaluator agree on what is pending.
    expect(s.scheduledNotRated, where).toBe(0);
    if (RATING_MODES.includes(s.mode)) expect(s.plan.counts.scheduled, where).toBe(Math.min(s.pendingAtStart, workLimit));
    else expect(s.scheduledWritten, where).toBe(0);
  }
};

const lag = (r: ReviewRecord) => daysBetween(r.pendingFrom, r.reviewedOn);

const daily = (mode: SessionMode, hour = 9) => () => [{ hour, mode }];

describe('regular study, 500 words, 60 days', () => {
  it('keeps the new-word budget, the card limits and a bounded backlog', () => {
    const world = createWorld({ scheduler, zone: utcZone, items: wordIds(500), learner: createLearner({ seed: 1 }) });
    run(world, { startDay: '2026-01-05', days: 60, sessionsFor: daily('today') });
    report('regular', world);

    expectSessionBounds(world);
    expect(max([...firstTeachingsByDay(world).values()])).toBeLessThanOrEqual(world.settings.todayNewPerDay['word-meaning']);

    // Seed 1 peaks at 32 pending. The bound is one full session plus its requeues, and the last 20
    // days must average under one session, so the backlog is not growing.
    const backlog = world.sessions.map((s) => s.backlogAtStart);
    expect(max(backlog)).toBeLessThanOrEqual(world.settings.workLimit + world.settings.requeueLimit);
    const tail = backlog.slice(-20);
    expect(tail.reduce((a, b) => a + b, 0) / tail.length).toBeLessThanOrEqual(world.settings.workLimit);
    // Two months of Hoy keep teaching: about five words a day once reviews take their share.
    expect([...firstTeachingsByDay(world).values()].reduce((a, b) => a + b, 0)).toBeGreaterThan(200);
  });

  it('writes events that rebuild to the incremental states', () => {
    const world = createWorld({ scheduler, zone: utcZone, items: wordIds(200), learner: createLearner({ seed: 11 }) });
    run(world, { startDay: '2026-01-05', days: 30, sessionsFor: daily('today') });
    expect(world.byItem.size).toBeGreaterThan(100);
    for (const [itemId, list] of world.byItem) {
      expect(rebuildItem(list, itemId, scheduler, new Map()), itemId).toEqual(world.states.get(itemId));
    }
  });
});

describe('absence', () => {
  const ABSENT_FROM = 20;
  const BACK_ON = 34;

  it('caps the return, holds new words while the backlog is high and drains it', () => {
    const world = createWorld({ scheduler, zone: utcZone, items: wordIds(500), learner: createLearner({ seed: 2 }) });
    run(world, {
      startDay: '2026-01-05',
      days: 60,
      sessionsFor: (d) => (d >= ABSENT_FROM && d < BACK_ON ? [] : [{ hour: 9, mode: 'today' }]),
    });
    report('absence', world);
    expectSessionBounds(world);
    const { workLimit } = world.settings;

    const back = world.sessions.find((s) => s.dayIndex === BACK_ON)!;
    // Seed 2: 73 pending on return, more than the tomorrow-load limit.
    expect(back.backlogAtStart).toBeGreaterThan(STUDY_RULES.tomorrowLoadLimit);
    expect(back.initialCards).toBe(workLimit);
    expect(back.plan.counts.newItems).toBe(0);
    expect(back.plan.leftOutCounts['work-limit']).toBe(back.backlogAtStart - workLimit);

    for (const s of world.sessions) if (s.backlogAtStart >= workLimit) expect(s.plan.counts.newItems, s.localDay).toBe(0);

    // Seed 2 drains in 4 sessions (73, 56, 43, 33, then 11): ceil(73 / 30) plus the lapses it brings back.
    const drained = world.sessions.find((s) => s.dayIndex >= BACK_ON && s.backlogAtStart < workLimit)!;
    expect(drained.dayIndex - BACK_ON).toBeLessThanOrEqual(6);
    // Once drained, Hoy teaches again.
    expect(world.sessions.filter((s) => s.dayIndex >= drained.dayIndex).some((s) => s.plan.counts.newItems > 0)).toBe(true);
  });
});

describe('small list, 15 words', () => {
  it('ends every session, bounds requeues and brings every word to review', () => {
    const items = wordIds(15);
    // A learner who fails half the practice right after teaching, so requeues hit their limits.
    const learner = createLearner({ seed: 3, rates: { 'new-practice': 0.5, 'teach-again': 0.5, requeue: 0.6, 'first-rating': 0.6 } });
    const world = createWorld({ scheduler, zone: utcZone, items, learner });
    const reachedReview = new Map<ItemId, number>();
    run(world, {
      startDay: '2026-01-05',
      days: 30,
      sessionsFor: daily('today'),
      afterDay: (d) => {
        for (const id of items) if (world.states.get(id)?.state === 'review' && !reachedReview.has(id)) reachedReview.set(id, d);
      },
    });
    report('small', world);
    expectSessionBounds(world);

    // The limits were reached, so the bounds above were tested, not idle.
    expect(max(world.sessions.map((s) => s.added))).toBeGreaterThanOrEqual(4);
    expect(reachedReview.size).toBe(items.length);
    // Seed 3: the last word reaches review on day 8.
    expect(max([...reachedReview.values()])).toBeLessThanOrEqual(10);
    // With nothing left to teach, sessions shrink to what is pending.
    const last = world.sessions.at(-1)!;
    expect(last.initialCards).toBe(last.pendingAtStart);
  });
});

describe('topic sessions with Hoy', () => {
  const ITEMS = 300;
  const topicOf = (itemId: ItemId) => [`t${Number(itemId.slice(-4)) % 3}`];
  const topicScope = (d: number): SessionScope => ({ kind: 'topics', topicIds: [`t${d % 3}`] });

  const simulate = (hoyEvery: number, seed: number) => {
    const world = createWorld({ scheduler, zone: utcZone, items: wordIds(ITEMS), topics: topicOf, learner: createLearner({ seed }) });
    run(world, {
      startDay: '2026-01-05',
      days: 40,
      sessionsFor: (d) => [
        { hour: 8, mode: 'topic', scope: topicScope(d) },
        ...(d % hoyEvery === 0 ? [{ hour: 20, mode: 'today' as const }] : []),
      ],
    });
    return world;
  };

  let alternating: World | null = null;
  const alternate = () => (alternating ??= simulate(2, 4));

  it('with a topic and Hoy every day, no due review waits more than one day', () => {
    const world = simulate(1, 4);
    report('topics daily', world);
    expectSessionBounds(world);

    expect(max(world.reviews.filter((r) => r.before === 'review').map(lag))).toBeLessThanOrEqual(1);
    expect(max(world.reviews.filter((r) => r.before === 'new').map(lag))).toBeLessThanOrEqual(1);
    for (const r of world.reviews) expect(lag(r), r.itemId).toBeGreaterThanOrEqual(0);

    for (const [day, taught] of firstTeachingsByDay(world)) expect(taught, day).toBeLessThanOrEqual(world.settings.newPerDay['word-meaning']);
    for (const s of world.sessions) {
      // A topic schedules its pending before teaching anything.
      if (s.plan.counts.newItems > 0) expect(s.plan.leftOutCounts['work-limit'], s.localDay).toBe(0);
      // Hoy only gets what the topic left of its share.
      if (s.mode === 'today') {
        expect(s.plan.counts.taughtToday + s.plan.counts.newItems).toBeLessThanOrEqual(
          Math.max(s.plan.counts.taughtToday, world.settings.todayNewPerDay['word-meaning']),
        );
      }
    }
  });

  it('with Hoy every other day, a review waits two days only after Hoy left it out at the work limit', () => {
    const world = alternate();
    report('topics, Hoy every other day', world);
    expectSessionBounds(world);
    const hoy = world.sessions.filter((s) => s.mode === 'today');
    for (const r of world.reviews.filter((r) => r.before === 'review' && lag(r) > 1)) {
      const leftBy = hoy.find(
        (s) => s.localDay >= r.pendingFrom && s.localDay < r.reviewedOn && s.plan.leftOut.some((l) => l.itemId === r.itemId && l.reason === 'work-limit'),
      );
      expect(leftBy, `${r.itemId} pending ${r.pendingFrom}, reviewed ${r.reviewedOn}`).toBeDefined();
    }
  });

  // Policy finding, see the 3C report. A daily topic keeps teaching 10 new words while Hoy, every other
  // day, leaves due reviews out: first ratings and learning steps rank ahead of due reviews in
  // `scheduledOrder`, and the topic's new-word gate only sees its own scope and `tomorrowLoad`, which
  // excludes overdue items. Seed 4: 55 of 520 reviews of review-state words waited 2 days.
  it('with Hoy every other day, no due review waits more than one day', () => {
    const world = alternate();
    expect(max(world.reviews.filter((r) => r.before === 'review').map(lag))).toBeLessThanOrEqual(1);
  });
});

describe('daylight saving time in Europe/Madrid', () => {
  const intlDay = (time: number) => new Date(time).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }) as LocalDay;
  const WINDOWS: readonly [LocalDay, number][] = [
    ['2026-03-22', 30],
    ['2026-10-18', 30],
  ];

  it('the hand-built rule matches Intl and keeps calendar days across both changes', () => {
    for (const [start, days] of WINDOWS) {
      const from = utcZone.at(start, 0);
      for (let t = from; t < from + days * DAY; t += 15 * 60_000) {
        expect(madridZone.localDay(t), new Date(t).toISOString()).toBe(intlDay(t));
        const midnight = madridZone.nextLocalMidnight(t);
        expect(madridZone.localDay(midnight)).toBe(addLocalDays(madridZone.localDay(t), 1));
        expect(madridZone.localDay(midnight - 1)).toBe(madridZone.localDay(t));
      }
    }
    expect(madridZone.nextLocalMidnight(madridZone.at('2026-03-29', 0)) - madridZone.at('2026-03-29', 0)).toBe(23 * HOUR);
    expect(madridZone.nextLocalMidnight(madridZone.at('2026-10-25', 0)) - madridZone.at('2026-10-25', 0)).toBe(25 * HOUR);
    // Yesterday is the calendar day before, not 24 hours ago: at 00:30 on 30 March, 24 hours back is
    // 28 March because 29 March had 23 hours.
    const t = madridZone.at('2026-03-30', 0.5);
    expect(addLocalDays(madridZone.localDay(t), -1)).toBe('2026-03-29');
    expect(madridZone.localDay(t - DAY)).toBe('2026-03-28');
  });

  const runAround = (start: LocalDay, hours: (day: LocalDay) => readonly number[]) => {
    const world = createWorld({ scheduler, zone: madridZone, items: wordIds(80), learner: createLearner({ seed: 5 }) });
    run(world, { startDay: start, days: 30, sessionsFor: (_, day) => hours(day).map((hour) => ({ hour, mode: 'today' as const })) });
    return world;
  };

  /** Scheduled reviews per item and local day, any state. */
  const reviewsPerItemDay = (world: World) => {
    const out = new Map<string, number>();
    for (const r of world.reviews) out.set(`${r.itemId}@${r.reviewedOn}`, (out.get(`${r.itemId}@${r.reviewedOn}`) ?? 0) + 1);
    return out;
  };

  /**
   * Reviews of a review-state item on the same local day as its previous rating. Steps may repeat in
   * a day; an item that left its steps or passed a review should wait for a later day.
   */
  const sameDayReviews = (world: World) => {
    const previous = new Map<ItemId, LocalDay>();
    const out: string[] = [];
    for (const r of world.reviews) {
      if (r.before === 'review' && previous.get(r.itemId) === r.reviewedOn) out.push(`${r.itemId}@${r.reviewedOn}`);
      previous.set(r.itemId, r.reviewedOn);
    }
    return out;
  };

  for (const [start] of WINDOWS) {
    for (const hour of [0.5, 23.5]) {
      it(`studying daily at ${hour}h local from ${start}: each pending item is reviewed on its day, once`, () => {
        const world = runAround(start, () => [hour]);
        report(`dst ${start} ${hour}h`, world);
        expectSessionBounds(world);
        // No work-limit left-outs, so every pending item had a place on its day.
        expect(world.sessions.every((s) => s.plan.leftOutCounts['work-limit'] === 0)).toBe(true);

        // One session per calendar day, each on the day it was meant for.
        expect(world.sessions.map((s) => s.localDay)).toEqual(Array.from({ length: 30 }, (_, d) => addLocalDays(start, d)));
        for (const event of world.events) expect(event.localDay, event.id).toBe(intlDay(event.occurredAt));

        // Reviews and first ratings never come before their day. They come on it, unless the item fell
        // due later on the very day of its previous review (the 25-hour day, see the next test).
        const lastReviewDay = new Map<ItemId, LocalDay>();
        for (const r of world.reviews) {
          expect(lag(r), `${r.itemId} ${r.before}`).toBeGreaterThanOrEqual(0);
          const dueOnReviewDay = lastReviewDay.get(r.itemId) === r.pendingFrom;
          if ((r.before === 'review' || r.before === 'new') && !dueOnReviewDay) expect(r.reviewedOn, `${r.itemId} ${r.before}`).toBe(r.pendingFrom);
          lastReviewDay.set(r.itemId, r.reviewedOn);
        }
        expect(max([...reviewsPerItemDay(world).values()])).toBe(1);
        expect(sameDayReviews(world)).toEqual([]);
        // Nothing overdue is left behind.
        const lastDay = world.sessions.at(-1)!.localDay;
        for (const state of world.states.values()) {
          if (state.state === 'review') expect(madridZone.localDay(state.dueAt) >= lastDay, state.itemId).toBe(true);
        }
        for (const [day, taught] of firstTeachingsByDay(world)) expect(taught, day).toBeLessThanOrEqual(10);

        // The run did cross the change: one session came 23 or 25 hours after the one before, and
        // first ratings and reviews were written in it.
        const gap = world.sessions.findIndex((s, i) => i > 0 && s.startedAt - world.sessions[i - 1].startedAt !== DAY);
        expect(gap).toBeGreaterThan(0);
        expect(Math.abs(world.sessions[gap].startedAt - world.sessions[gap - 1].startedAt - DAY)).toBe(HOUR);
        const after = world.reviews.filter((r) => r.reviewedOn === world.sessions[gap].localDay);
        expect(after.some((r) => r.before === 'new')).toBe(true);
        expect(after.some((r) => r.before === 'review')).toBe(true);
      });
    }
  }

  /** Hoy every day at 00:30, and a second Hoy at 23:45 on the day of the change. */
  const extraOn = (change: LocalDay) => (day: LocalDay) => (day === change ? [0.5, 23.75] : [0.5]);

  it('with a second Hoy on the spring change day, no review-state item is rated twice that day', () => {
    const world = runAround('2026-03-15', extraOn('2026-03-29'));
    expectSessionBounds(world);
    const extra = world.sessions.find((s) => s.localDay === '2026-03-29' && s.startedAt === madridZone.at('2026-03-29', 23.75))!;
    expect(extra.scheduledWritten).toBeGreaterThan(0);
    expect(sameDayReviews(world)).toEqual([]);
  });

  // Policy finding, see the 3C report. On 25 October 2026 (25 hours), a review at 00:30 with a one-day
  // interval is due at 23:30 the same local day, so `pendingToday` holds again right after it is
  // rated and a second Hoy that day rates it a second time. Seed 5 from 11 October: word-meaning:sim-0069 leaves relearning with Good at 00:30 on the
  // 25th, falls due at 23:30 the same day and is rated again at 23:45.
  it('with a second Hoy on the autumn change day, no review-state item is rated twice that day', () => {
    const world = runAround('2026-10-11', extraOn('2026-10-25'));
    expect(sameDayReviews(world)).toEqual([]);
  });
});

describe('weak words', () => {
  const ITEMS = wordIds(60);
  const FAILING = new Set(ITEMS.filter((_, i) => i % 6 === 0));
  const DAYS = 45;
  const START: LocalDay = '2026-01-05';

  /** The weak rule from the review records alone, as contracts.md states it. */
  const weakOracle = (records: readonly ReviewRecord[], today: LocalDay) => {
    let last = records.length - 1;
    while (last >= 0 && records[last].rating !== 'again') last -= 1;
    if (last < 0 || records[last].reviewedOn < addLocalDays(today, 1 - STUDY_RULES.weakWindowDays)) return false;
    return records.length - last - 1 < STUDY_RULES.weakRecoveryStreak;
  };

  it('isWeak follows scheduled misses and Flojos never rates', () => {
    // The failing words recall 15% of the time until day 20, then like the rest.
    const learner = createLearner({ seed: 6, failing: { items: FAILING, recall: 0.15, until: utcZone.at(addLocalDays(START, 20), 0) } });
    const world = createWorld({ scheduler, zone: utcZone, items: ITEMS, learner });
    const weakDays = new Map<ItemId, number>();

    for (let d = 0; d < DAYS; d++) {
      const day = addLocalDays(START, d);
      world.runSession(d, day, { hour: 9, mode: 'today' });

      const records = new Map<ItemId, ReviewRecord[]>();
      for (const r of world.reviews) records.set(r.itemId, [...(records.get(r.itemId) ?? []), r]);
      const weakNow = ITEMS.filter((id) => weakOracle(records.get(id) ?? [], day));
      for (const id of ITEMS) expect(isWeak(world.itemEvents(id), id, day), `${id} on ${day}`).toBe(weakNow.includes(id));
      for (const id of weakNow) weakDays.set(id, (weakDays.get(id) ?? 0) + 1);

      const before = new Map(world.states);
      const flojos = world.runSession(d, day, { hour: 21, mode: 'weak' });
      expect(new Map(world.states)).toEqual(before);
      if (weakNow.length <= world.settings.practiceLimit) {
        expect(new Set(flojos.plan.cards.map((c) => c.itemId))).toEqual(new Set(weakNow));
      }
    }
    report('weak', world);
    expectSessionBounds(world);

    const flojosEvents = world.events.filter((e) => e.sessionMode === 'weak');
    expect(flojosEvents.length).toBeGreaterThan(0);
    expect(flojosEvents.some((e) => e.type === 'scheduled-review')).toBe(false);

    // Every failing word that met a scheduled Again became weak. Seed 6: 8 of 10; the other two passed
    // their first rating by chance and their next review came after day 20.
    const failedOnce = [...FAILING].filter((id) => world.reviews.some((r) => r.itemId === id && r.rating === 'again'));
    expect(failedOnce.length).toBeGreaterThanOrEqual(FAILING.size - 3);
    for (const id of failedOnce) expect(weakDays.get(id) ?? 0, id).toBeGreaterThan(0);
    // Failing words spend far longer weak than the rest.
    const meanWeak = (ids: readonly ItemId[]) => ids.reduce((sum, id) => sum + (weakDays.get(id) ?? 0), 0) / ids.length;
    expect(meanWeak([...FAILING])).toBeGreaterThan(3 * meanWeak(ITEMS.filter((id) => !FAILING.has(id))));
    // Once the learner stops failing, scheduled reviews recover them; Flojos alone could not.
    const lastDay = addLocalDays(START, DAYS - 1);
    const records = (id: ItemId) => world.reviews.filter((r) => r.itemId === id);
    expect([...FAILING].filter((id) => weakOracle(records(id), lastDay)).length).toBeLessThan(FAILING.size / 2);
  });
});
