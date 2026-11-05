import { beforeAll, describe, expect, it } from 'vitest';
import {
  CorruptLogError,
  compareReplayOrder,
  createScheduler,
  createSchedulerRegistry,
  DEFAULT_SCHEDULER_CONFIG,
  rebuildItem,
  type Scheduler,
  type SchedulerRegistry,
} from '../../../src/domain/learning/scheduler';
import type { LearningEvent, Rating, SchedulerState } from '../../../src/domain/learning/types';
import { at, exposure, OTHER_WORD, practice, review, voided, WORD } from './fixtures';

let scheduler: Scheduler;
let slower: Scheduler;
let registry: SchedulerRegistry;

beforeAll(async () => {
  scheduler = await createScheduler(DEFAULT_SCHEDULER_CONFIG);
  slower = await createScheduler({ ...DEFAULT_SCHEDULER_CONFIG, desiredRetention: 0.8 });
  registry = await createSchedulerRegistry([
    { id: scheduler.configId, config: scheduler.config },
    { id: slower.configId, config: slower.config },
  ]);
});

/** Good, Again on a review card, Good after the relearning step, Hard, Easy. */
const steps: readonly { rating: Rating; time: number }[] = [
  { rating: 'good', time: at(1) },
  { rating: 'again', time: at(6) },
  { rating: 'good', time: at(6, 0.25) },
  { rating: 'hard', time: at(9) },
  { rating: 'easy', time: at(14) },
];

const reviewsOf = (list: typeof steps, deviceId = 'device-a') =>
  list.map(({ rating, time }, index) => review({ id: `${deviceId}-r${index}`, occurredAt: time, rating, configId: scheduler.configId, deviceId, sequence: index }));

/** The incremental path: apply, store as JSON, read back, apply again. */
const incremental = (list: typeof steps) =>
  list.reduce<SchedulerState>(
    (state, { rating, time }) => JSON.parse(JSON.stringify(scheduler.apply(state, rating, time))) as SchedulerState,
    scheduler.newState(WORD),
  );

const rebuild = (events: readonly LearningEvent[]) => rebuildItem(events, WORD, scheduler, registry);

describe('apply', () => {
  it('stores dates as ms, cites its config and rounds scheduledDays', () => {
    const state = scheduler.apply(scheduler.newState(WORD), 'good', at(0));
    expect(state).toEqual({
      schemaVersion: 1,
      itemId: WORD,
      configId: scheduler.configId,
      state: 'review',
      dueAt: Date.parse('2026-01-05T18:39:55.164Z'),
      lastReviewAt: at(0),
      stability: 3.9221,
      stabilityFast: 3.13768,
      difficulty: 3.53072398,
      scheduledDays: 4.777722,
      reps: 1,
      lapses: 0,
      learningStep: 0,
    });
  });

  it('goes through relearning and back with a stored card', () => {
    const states = steps.reduce<SchedulerState[]>((acc, { rating, time }) => [...acc, scheduler.apply(acc[acc.length - 1] ?? scheduler.newState(WORD), rating, time)], []);
    expect(states.map((state) => (state.state === 'new' ? null : [state.state, state.lapses]))).toEqual([
      ['review', 0],
      ['relearning', 1],
      ['review', 1],
      ['review', 1],
      ['review', 1],
    ]);
  });

  it('moves a clock that went backwards up to the last review', () => {
    const reviewed = scheduler.apply(scheduler.newState(WORD), 'good', at(1));
    const late = scheduler.apply(reviewed, 'good', at(1) - 3_600_000);
    expect(late).toEqual(scheduler.apply(reviewed, 'good', at(1)));
    expect(late.lastReviewAt).toBe(at(1));
  });

  it('rejects an invalid instant', () => {
    expect(() => scheduler.apply(scheduler.newState(WORD), 'good', Number.NaN)).toThrow(RangeError);
    expect(() => scheduler.apply(scheduler.newState(WORD), 'good', 0)).toThrow(RangeError);
  });

  it('cites the config that applied the last review', () => {
    const first = scheduler.apply(scheduler.newState(WORD), 'good', at(0));
    expect(slower.apply(first, 'good', at(5)).configId).toBe(slower.configId);
    expect(scheduler.newState(WORD, slower.configId).configId).toBe(slower.configId);
  });
});

describe('rebuildItem', () => {
  it('equals the incremental state', () => {
    expect(rebuild(reviewsOf(steps))).toEqual(incremental(steps));
  });

  it('undoes a middle review by replaying the others', () => {
    const events = reviewsOf(steps);
    const undo = voided({ id: 'void-1', occurredAt: at(20), targetEventId: events[2].id });
    const kept = steps.filter((_, index) => index !== 2);
    expect(rebuild([...events, undo])).toEqual(incremental(kept));
    // Voiding twice is voiding once.
    expect(rebuild([...events, undo, voided({ id: 'void-2', occurredAt: at(21), targetEventId: events[2].id })])).toEqual(incremental(kept));
  });

  it('ignores a repeated copy of an event', () => {
    const events = reviewsOf(steps);
    expect(rebuild([...events, ...events.map((event) => ({ ...event }))])).toEqual(rebuild(events));
  });

  it('rebuilds the same state whatever order a merge delivers the events in', () => {
    const fromA = reviewsOf(steps.slice(0, 3), 'device-a');
    // Device B reviewed offline in between; its review becomes an early one after merging.
    const fromB = [review({ id: 'device-b-r0', occurredAt: at(3), rating: 'good', configId: scheduler.configId, deviceId: 'device-b' })];
    const merged = rebuild([...fromA, ...fromB]);
    expect(rebuild([...fromB, ...fromA])).toEqual(merged);
    expect(rebuild([...fromA, ...fromB].reverse())).toEqual(merged);
    expect(merged).toEqual(
      incremental([steps[0], { rating: 'good', time: at(3) }, steps[1], steps[2]]),
    );
  });

  it('breaks ties by device, sequence and id, comparing strings by code unit', () => {
    const tie = { occurredAt: at(1), configId: scheduler.configId };
    const events = [
      review({ ...tie, id: 'z', rating: 'again', deviceId: 'device-b', sequence: 0 }),
      review({ ...tie, id: 'b', rating: 'good', deviceId: 'device-a', sequence: 2 }),
      review({ ...tie, id: 'a', rating: 'easy', deviceId: 'device-a', sequence: 2 }),
      review({ ...tie, id: 'c', rating: 'hard', deviceId: 'Device-c', sequence: 9 }),
    ];
    expect([...events].sort(compareReplayOrder).map((event) => event.id)).toEqual(['c', 'a', 'b', 'z']);
    expect(rebuild(events)).toEqual(incremental(['hard', 'easy', 'good', 'again'].map((rating) => ({ rating: rating as Rating, time: at(1) }))));
  });

  it('applies each review with its own config', () => {
    const events = [
      review({ id: 'r0', occurredAt: at(0), rating: 'good', configId: scheduler.configId }),
      review({ id: 'r1', occurredAt: at(5), rating: 'good', configId: slower.configId }),
    ];
    const expected = slower.apply(scheduler.apply(scheduler.newState(WORD), 'good', at(0)), 'good', at(5));
    expect(rebuild(events)).toEqual(expected);
    expect(rebuild(events)).not.toEqual(scheduler.apply(scheduler.apply(scheduler.newState(WORD), 'good', at(0)), 'good', at(5)));
  });

  it('stops on a review citing an unknown config', () => {
    const events = [review({ id: 'r0', occurredAt: at(0), rating: 'good', configId: 'scheduler-config:sha256:unknown' })];
    expect(() => rebuild(events)).toThrow(CorruptLogError);
  });

  it('stops on two attempt events for one attempt, even if one is voided', () => {
    const first = review({ id: 'r0', occurredAt: at(0), rating: 'good', configId: scheduler.configId, attemptId: 'attempt-1' });
    const second = practice({ id: 'p0', occurredAt: at(0, 1), attemptId: 'attempt-1' });
    const undo = voided({ id: 'void', occurredAt: at(1), targetEventId: 'p0' });
    expect(() => rebuild([first, second, undo])).toThrow(expect.objectContaining({ reason: 'duplicate-attempt' }));
  });

  it('stops on one id with two contents', () => {
    const event = review({ id: 'r0', occurredAt: at(0), rating: 'good', configId: scheduler.configId });
    expect(() => rebuild([event, { ...event, occurredAt: at(1) }])).toThrow(expect.objectContaining({ reason: 'conflicting-event' }));
  });

  it('ignores other items and practice', () => {
    const events = [
      ...reviewsOf(steps.slice(0, 2)),
      review({ id: 'other', occurredAt: at(3), rating: 'again', configId: scheduler.configId, itemId: OTHER_WORD }),
      practice({ id: 'p0', occurredAt: at(4), outcome: 'incorrect' }),
    ];
    expect(rebuild(events)).toEqual(incremental(steps.slice(0, 2)));
  });

  it('keeps a new item on the current config', () => {
    expect(rebuild([])).toEqual({ schemaVersion: 1, itemId: WORD, configId: scheduler.configId, state: 'new', eligibleFrom: null });
  });
});

describe('eligibleFrom', () => {
  const eligibleFrom = (events: readonly LearningEvent[]) => {
    const state = rebuild(events);
    return state.state === 'new' ? state.eligibleFrom : 'reviewed';
  };

  it('is the day after the first correct practice that follows teaching', () => {
    expect(eligibleFrom([exposure({ id: 'e0', occurredAt: at(0, 10) }), practice({ id: 'p0', occurredAt: at(0, 11) })])).toBe('2026-01-02');
  });

  it('uses the practice event local day, even across a year end', () => {
    const events = [exposure({ id: 'e0', occurredAt: at(0) }), practice({ id: 'p0', occurredAt: at(0, 1), localDay: '2026-12-31' })];
    expect(eligibleFrom(events)).toBe('2027-01-01');
  });

  it('stays null without teaching, after a failed practice or when the practice came first', () => {
    expect(eligibleFrom([practice({ id: 'p0', occurredAt: at(0) })])).toBeNull();
    expect(eligibleFrom([exposure({ id: 'e0', occurredAt: at(0) }), practice({ id: 'p0', occurredAt: at(0, 1), outcome: 'incorrect' })])).toBeNull();
    expect(eligibleFrom([practice({ id: 'p0', occurredAt: at(0) }), exposure({ id: 'e0', occurredAt: at(0, 1) })])).toBeNull();
    expect(eligibleFrom([exposure({ id: 'e0', occurredAt: at(0), reason: 'already-known' }), practice({ id: 'p0', occurredAt: at(0, 1) })])).toBeNull();
  });

  it('waits for a pass without a hint that gave the answer away', () => {
    const assisted = { ...practice({ id: 'p0', occurredAt: at(0, 1) }), evidence: [{ id: 'x', skill: 'meaning', recordedAt: at(0, 1), evaluation: { outcome: 'correct' }, assisted: true, confusions: [], mistakes: null }] } as LearningEvent;
    const taught = exposure({ id: 'e0', occurredAt: at(0) });
    expect(eligibleFrom([taught, assisted])).toBeNull();
    expect(eligibleFrom([taught, assisted, practice({ id: 'p1', occurredAt: at(1, 1) })])).toBe('2026-01-03');
  });

  it('waits for the retaught word to pass, and drops a voided pass', () => {
    const failed = [exposure({ id: 'e0', occurredAt: at(0) }), practice({ id: 'p0', occurredAt: at(0, 1), outcome: 'incorrect' })];
    const retaught = [...failed, exposure({ id: 'e1', occurredAt: at(2) }), practice({ id: 'p1', occurredAt: at(2, 1) })];
    expect(eligibleFrom(retaught)).toBe('2026-01-04');
    expect(eligibleFrom([...retaught, voided({ id: 'v', occurredAt: at(2, 2), targetEventId: 'p1' })])).toBeNull();
  });

  it('is gone once the word has a scheduled review', () => {
    const events = [
      exposure({ id: 'e0', occurredAt: at(0) }),
      practice({ id: 'p0', occurredAt: at(0, 1) }),
      review({ id: 'r0', occurredAt: at(1), rating: 'good', configId: scheduler.configId }),
    ];
    expect(eligibleFrom(events)).toBe('reviewed');
  });
});
