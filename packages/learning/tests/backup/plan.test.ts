import { describe, expect, it } from 'vitest';
import {
  createBackup,
  highestSequence,
  parseBackup,
  planMerge,
  planReplace,
  serializeBackup,
  type BackupErrorCode,
  type LearningLog,
} from '../../src/backup/index.ts';
import { validateAttemptEvent } from '../../src/evaluation/index.ts';
import { configId, DEFAULT_SCHEDULER_CONFIG } from '../../src/scheduler/index.ts';
import type { LearningEvent, SchedulerConfig } from '../../src/types.ts';
import { CHAR, OTHER_WORD, WORD, at, deepFreeze, exposure, practice, review, stored, twoDevices, voided } from './fixtures.ts';

const codes = async (current: LearningLog, incoming: LearningLog): Promise<BackupErrorCode[]> => {
  const planned = await planMerge(current, incoming);
  return planned.ok ? [] : planned.error.map((error) => error.code);
};

const empty: LearningLog = { events: [], configs: [] };

describe('fixtures', () => {
  it('every attempt event passes the evaluator rules', async () => {
    const { a, b } = await twoDevices();
    for (const event of [...a.events, ...b.events]) expect(validateAttemptEvent(event)).toEqual([]);
  });
});

describe('merge', () => {
  it('adds the events and configs the current log lacks and rebuilds the items they touch', async () => {
    const { a, b } = await twoDevices();
    const planned = await planMerge(a, b);
    if (!planned.ok) throw new Error(JSON.stringify(planned.error));
    expect(planned.value.events.map((event) => event.id)).toEqual(['shared-exposure', 'b-exposure', 'a-practice', 'a-review', 'a-void', 'b-review', 'b-invalid']);
    expect(planned.value.newEvents.map((event) => event.id)).toEqual(['b-exposure', 'b-review', 'b-invalid']);
    expect(planned.value.newConfigs).toEqual([]);
    expect(planned.value.itemsToRebuild).toEqual([CHAR, OTHER_WORD]);
  });

  it('rebuilds the item of a new void', async () => {
    const { a } = await twoDevices();
    const withoutVoid = { ...a, events: a.events.filter((event) => event.type !== 'attempt-voided') };
    const planned = await planMerge(withoutVoid, a);
    expect(planned.ok && planned.value).toMatchObject({ newEvents: [{ id: 'a-void' }], itemsToRebuild: [WORD] });
  });

  it('is commutative', async () => {
    const { a, b } = await twoDevices();
    const ab = await planMerge(a, b);
    const ba = await planMerge(b, a);
    if (!ab.ok || !ba.ok) throw new Error('expected both merges to pass');
    expect(ab.value.events).toEqual(ba.value.events);
    expect(ab.value.configs).toEqual(ba.value.configs);
  });

  it('is idempotent', async () => {
    const { a, b } = await twoDevices();
    const aa = await planMerge(a, a);
    expect(aa.ok && aa.value).toMatchObject({ newEvents: [], newConfigs: [], itemsToRebuild: [] });
    expect(aa.ok && aa.value.events).toEqual([...a.events].sort((x, y) => x.occurredAt - y.occurredAt));

    const ab = await planMerge(a, b);
    if (!ab.ok) throw new Error('expected a merge');
    const again = await planMerge(ab.value, b);
    expect(again.ok && again.value).toMatchObject({ events: ab.value.events, newEvents: [], itemsToRebuild: [] });
  });

  it('adds a config only the incoming log carries', async () => {
    const { a } = await twoDevices();
    const planned = await planMerge(empty, a);
    expect(planned.ok && planned.value.newConfigs).toEqual(a.configs);
  });

  it('takes a parsed file', async () => {
    const { a, b } = await twoDevices();
    const parsed = parseBackup(serializeBackup(createBackup({ deviceId: 'device-b', exportedAt: at(9), ...b })));
    if (!parsed.ok) throw new Error('expected a backup');
    expect((await planMerge(a, parsed.value)).ok).toBe(true);
  });

  it('does not touch its inputs', async () => {
    const { a, b } = await twoDevices();
    deepFreeze(a);
    deepFreeze(b);
    expect((await planMerge(a, b)).ok).toBe(true);
  });
});

describe('rejects the whole backup', () => {
  it('when an event id comes with another content', async () => {
    const { a } = await twoDevices();
    const changed = { ...a.events[1], sequence: 99 } as LearningEvent;
    expect(await codes(a, { ...a, events: [changed] })).toEqual(['conflicting-event']);
  });

  it('when the same backup holds one id twice with two contents', async () => {
    const { a } = await twoDevices();
    const changed = { ...a.events[1], sequence: 99 } as LearningEvent;
    expect(await codes(empty, { ...a, events: [...a.events, changed] })).toEqual(['conflicting-event']);
  });

  it('when a config does not hash to its id', async () => {
    const { config } = await twoDevices();
    const tampered = { id: config.id, config: { ...config.config, desiredRetention: 0.85 } };
    expect(await codes(empty, { events: [], configs: [tampered] })).toEqual(['config-hash-mismatch']);
  });

  it('when one config id comes with two configs', async () => {
    const { a, config } = await twoDevices();
    const tampered = { id: config.id, config: { ...config.config, desiredRetention: 0.85 } };
    expect(await codes(a, { events: [], configs: [tampered] })).toEqual(['conflicting-config', 'config-hash-mismatch']);
  });

  it('when a config is for another ts-fsrs version', async () => {
    const other = await stored({ ...DEFAULT_SCHEDULER_CONFIG, packageVersion: '6.0.1' } as unknown as SchedulerConfig);
    expect(await codes(empty, { events: [], configs: [other] })).toEqual(['package-version']);
  });

  it('when a config would not run, even with a matching hash', async () => {
    const fuzzy = { ...DEFAULT_SCHEDULER_CONFIG, enableFuzz: true } as unknown as SchedulerConfig;
    const other = { id: await configId(fuzzy), config: fuzzy };
    expect(await codes(empty, { events: [], configs: [other] })).toEqual(['invalid-config']);
  });

  it('when a review cites a config neither side carries', async () => {
    const other = await configId({ ...DEFAULT_SCHEDULER_CONFIG, desiredRetention: 0.85 });
    const event = review({ id: 'r', occurredAt: at(1), configId: other });
    expect(await codes(empty, { events: [event], configs: [] })).toEqual(['unknown-config']);
  });

  it('accepts a review whose config only the current log carries', async () => {
    const { a, config } = await twoDevices();
    const event = review({ id: 'r', occurredAt: at(4), configId: config.id, sequence: 9 });
    expect(await codes(a, { events: [event], configs: [] })).toEqual([]);
  });

  it('when two attempt events share an attempt id, one on each side', async () => {
    const { a } = await twoDevices();
    const twin = practice({ id: 'twin', occurredAt: at(0, 6), attemptId: 'attempt-a-practice', deviceId: 'device-b' });
    expect(await codes(a, { events: [twin], configs: [] })).toEqual(['duplicate-attempt']);
  });

  it('when a void targets an event that is in neither log', async () => {
    const event = voided({ id: 'v', occurredAt: at(1), targetEventId: 'nowhere' });
    expect(await codes(empty, { events: [event], configs: [] })).toEqual(['void-target-missing']);
  });

  it('accepts a void whose target only the current log has', async () => {
    const { a } = await twoDevices();
    const event = voided({ id: 'v', occurredAt: at(4), sequence: 9, targetEventId: 'a-review' });
    expect(await codes(a, { events: [event], configs: [] })).toEqual([]);
  });

  it.each([
    ['an exposure', 'shared-exposure'],
    ['another void', 'a-void'],
  ])('when a void targets %s', async (_name, target) => {
    const { a } = await twoDevices();
    const event = voided({ id: 'v', occurredAt: at(4), sequence: 9, targetEventId: target });
    expect(await codes(a, { events: [event], configs: [] })).toEqual(['void-target-not-voidable']);
  });

  it('when a void names another item than its target', async () => {
    const { a } = await twoDevices();
    const event = voided({ id: 'v', occurredAt: at(4), sequence: 9, targetEventId: 'a-review', itemId: OTHER_WORD });
    expect(await codes(a, { events: [event], configs: [] })).toEqual(['void-item-mismatch']);
  });

  it('when an attempt event breaks the evaluator rules', async () => {
    const { a, config } = await twoDevices();
    const easy = { ...review({ id: 'r', occurredAt: at(4), configId: config.id }), rating: 'easy' } as LearningEvent;
    const planned = await planMerge(a, { events: [easy], configs: [] });
    expect(planned.ok || planned.error).toEqual([expect.objectContaining({ code: 'invalid-attempt-event', eventId: 'r', attemptCode: 'rating-mismatch' })]);
  });

  it('when an attempt event names an evaluator version this build does not know', async () => {
    const event = { ...practice({ id: 'p', occurredAt: at(1) }), evaluatorVersion: 'learning-evaluator@99' } as LearningEvent;
    const planned = await planMerge(empty, { events: [event], configs: [] });
    expect(planned.ok || planned.error[0].attemptCode).toBe('unknown-evaluator-version');
  });

  it('and plans nothing when only part of it is broken', async () => {
    const { a } = await twoDevices();
    const incoming = {
      events: [voided({ id: 'v', occurredAt: at(4), targetEventId: 'nowhere' }), exposure({ id: 'fine', occurredAt: at(4), itemId: CHAR })],
      configs: [],
    };
    const planned = await planMerge(a, incoming);
    expect(planned).toEqual({ ok: false, error: [expect.objectContaining({ code: 'void-target-missing' })] });
    expect('value' in planned).toBe(false);
  });
});

describe('replace', () => {
  it('keeps the backup as it is and rebuilds every item', async () => {
    const { a } = await twoDevices();
    const planned = await planReplace(a);
    expect(planned.ok && planned.value.itemsToRebuild).toEqual([WORD]);
    expect(planned.ok && planned.value.events.map((event) => event.id)).toEqual(['shared-exposure', 'a-practice', 'a-review', 'a-void']);
    expect(planned.ok && planned.value.configs).toEqual(a.configs);
  });

  it('applies the same rules as a merge', async () => {
    const { a } = await twoDevices();
    const broken = { ...a, events: a.events.filter((event) => event.id !== 'a-practice') };
    const planned = await planReplace(broken);
    expect(planned.ok || planned.error.map((error) => error.code)).toEqual(['void-target-missing']);
    const withoutConfig = { ...a, configs: [] };
    const missing = await planReplace(withoutConfig);
    expect(missing.ok || missing.error.map((error) => error.code)).toEqual(['unknown-config']);
  });

  it('finds the highest sequence a device wrote', async () => {
    const { a, b } = await twoDevices();
    const events = [...a.events, ...b.events];
    expect(highestSequence(events, 'device-a')).toBe(3);
    expect(highestSequence(events, 'device-b')).toBe(2);
    expect(highestSequence(events, 'device-c')).toBe(-1);
  });
});
