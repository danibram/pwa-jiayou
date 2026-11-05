import { describe, expect, it } from 'vitest';
import { createBackup, isItemId, isLocalDay, parseBackup, serializeBackup } from '../../../src/domain/learning/backup';
import type { LearningBackup, LearningEvent } from '../../../src/domain/learning/types';
import { CHAR, T0, at, exposure, meaningExercise, practice, twoDevices } from './fixtures';

const sample = async (): Promise<LearningBackup> => {
  const { a, b, config } = await twoDevices();
  const richPractice: LearningEvent = {
    ...(practice({ id: 'rich', occurredAt: at(3), itemId: CHAR }) as Extract<LearningEvent, { type: 'practice' }>),
    exercise: {
      ...meaningExercise,
      id: 'exercise-write',
      skill: 'writing',
      format: 'writing',
      grading: 'automatic',
      cue: 'gloss',
      stage: 'memory',
      options: [{ id: 'o1', text: 'hola', contentId: null }, { id: 'o2', text: 'adiós' }],
      context: 'contexto',
    },
    actions: [
      { type: 'hint', at: at(3) - 3_000, hint: { kind: 'other', revealsAnswer: false, value: '丿' } },
      { type: 'answer', at: at(3) - 2_000, answer: null, selectedOptionId: 'o2', evaluation: { outcome: 'invalid', reason: 'other' } },
      { type: 'drawing', at: at(3) - 1_000, mistakes: 1, evaluation: { outcome: 'partial', missing: ['stroke'] } },
    ],
    evaluation: { outcome: 'partial', missing: ['stroke'] },
    evidence: [
      { id: 'ev', skill: 'writing', recordedAt: at(3), evaluation: { outcome: 'correct' }, assisted: true, confusions: [{ optionId: 'o2', contentId: null }], mistakes: 1 },
    ],
  };
  return createBackup({ deviceId: 'device-a', exportedAt: at(5), events: [...b.events, ...a.events, richPractice], configs: [config] });
};

/** The serialized sample as plain JSON, for breaking one field at a time. */
const raw = async () => JSON.parse(serializeBackup(await sample())) as Record<string, any>;

describe('round trip', () => {
  it('parses what it serializes, every event type included', async () => {
    const backup = await sample();
    expect(new Set(backup.events.map((event) => event.type))).toEqual(new Set(['exposure', 'practice', 'scheduled-review', 'invalid-attempt', 'attempt-voided']));
    const parsed = parseBackup(serializeBackup(backup));
    expect(parsed).toEqual({ ok: true, value: backup });
  });

  it('sorts events in replay order and configs by id, so equal logs give equal files', async () => {
    const backup = await sample();
    const reversed = createBackup({ ...backup, events: [...backup.events].reverse() });
    expect(serializeBackup(reversed)).toBe(serializeBackup(backup));
    expect(backup.events[0].occurredAt).toBe(T0);
  });

  it('builds new objects instead of returning the input', async () => {
    const parsed = parseBackup(serializeBackup(await sample()));
    if (!parsed.ok) throw new Error('expected a backup');
    expect(Object.getPrototypeOf(parsed.value.events[0])).toBe(Object.prototype);
  });
});

type Edit = (file: Record<string, any>) => void;
const eventOf = (file: Record<string, any>, type: string) => file.events.find((event: { type: string }) => event.type === type);

describe('rejects the whole file', () => {
  it('when it is not JSON', () => {
    expect(parseBackup('{')).toEqual({ ok: false, error: [expect.objectContaining({ code: 'invalid-json' })] });
  });

  it('when the schema version is unknown', async () => {
    const file = await raw();
    file.schemaVersion = 2;
    expect(parseBackup(JSON.stringify(file))).toEqual({ ok: false, error: [expect.objectContaining({ code: 'unsupported-version' })] });
  });

  it.each<[string, Edit, string]>([
    ['a missing field', (file) => delete file.events[0].sessionId, 'events[0].sessionId'],
    ['an unknown field', (file) => (file.events[0].extra = 1), 'events[0].extra'],
    ['an unknown top-level field', (file) => (file.note = 'x'), 'note'],
    ['an unknown event type', (file) => (file.events[0].type = 'forgotten'), 'events[0].type'],
    ['an impossible local day', (file) => (file.events[0].localDay = '2026-02-30'), 'events[0].localDay'],
    ['a local day in another format', (file) => (file.events[0].localDay = '2026-1-01'), 'events[0].localDay'],
    ['a word item without an id', (file) => (file.events[0].itemId = 'word-meaning:'), 'events[0].itemId'],
    ['an unknown item kind', (file) => (file.events[0].itemId = 'word-tones:word-4f60'), 'events[0].itemId'],
    ['a negative sequence', (file) => (file.events[0].sequence = -1), 'events[0].sequence'],
    ['a fractional sequence', (file) => (file.events[0].sequence = 1.5), 'events[0].sequence'],
    ['an event at the epoch', (file) => (file.events[0].occurredAt = 0), 'events[0].occurredAt'],
    ['a time as text', (file) => (file.exportedAt = '2026-01-01'), 'exportedAt'],
    ['an unknown session mode', (file) => (file.events[0].sessionMode = 'exam'), 'events[0].sessionMode'],
    ['a short config id', (file) => (eventOf(file, 'scheduled-review').configId = 'scheduler-config:sha256:abc'), 'configId'],
    ['an invalid outcome in a practice', (file) => (eventOf(file, 'practice').evaluation = { outcome: 'invalid', reason: 'other' }), 'evaluation.outcome'],
    ['a partial without what is missing', (file) => (eventOf(file, 'practice').evaluation = { outcome: 'partial' }), 'evaluation.missing'],
    ['an unknown rating', (file) => (eventOf(file, 'scheduled-review').rating = 'perfect'), 'rating'],
    ['an unknown action', (file) => (eventOf(file, 'practice').actions[0].type = 'skip'), 'actions[0].type'],
    ['an unknown void reason', (file) => (eventOf(file, 'attempt-voided').reason = 'mistake'), 'reason'],
    ['a void without a target', (file) => delete eventOf(file, 'attempt-voided').targetEventId, 'targetEventId'],
    ['an exposure with an unknown reason', (file) => (eventOf(file, 'exposure').card.reason = 'quiz'), 'card.reason'],
    ['events that are not a list', (file) => (file.events = {}), 'events'],
    ['a config with parameters as text', (file) => (file.configs[0].config.parameters = 'w'), 'configs[0].config.parameters'],
    ['a config with an extra option', (file) => (file.configs[0].config.seed = 1), 'configs[0].config.seed'],
  ])('%s', async (_name, edit, path) => {
    const file = await raw();
    edit(file);
    const parsed = parseBackup(JSON.stringify(file));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.every((error) => error.code === 'invalid-format')).toBe(true);
    expect(parsed.error.some((error) => error.path?.endsWith(path))).toBe(true);
  });

  it('when an object carries its own __proto__ key', async () => {
    const text = serializeBackup(await sample()).replace('"schemaVersion":1,"id"', '"__proto__":{"polluted":true},"schemaVersion":1,"id"');
    expect(text).toContain('__proto__');
    const parsed = parseBackup(text);
    expect(parsed.ok || parsed.error[0].path).toBe('events[0].__proto__');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('when the item id does not match the content', async () => {
    const file = await raw();
    eventOf(file, 'exposure').content.contentId = 'word-8c22-8c22-xie4-xie5';
    const parsed = parseBackup(JSON.stringify(file));
    expect(parsed.ok || parsed.error.map((error) => error.code)).toEqual(['item-content-mismatch']);
  });

  it('collects every error, not only the first', async () => {
    const file = await raw();
    file.events[0].localDay = 'ayer';
    file.events[1].sequence = -1;
    const parsed = parseBackup(JSON.stringify(file));
    expect(parsed.ok || parsed.error.length).toBe(2);
  });
});

describe('formats', () => {
  it.each(['2026-11-05', '2024-02-29'])('%s is a local day', (day) => expect(isLocalDay(day)).toBe(true));
  it.each(['2025-02-29', '2026-13-01', '2026-11-5', 20261105])('%s is not', (day) => expect(isLocalDay(day)).toBe(false));

  it.each(['word-meaning:word-4f60-597d-ni3-hao3', 'character-writing:char-4f60', 'character-writing:char-20000'])('%s is an item id', (id) => {
    expect(isItemId(id)).toBe(true);
  });
  it.each(['character-writing:char-04f60', 'character-writing:char-4F60', 'character-writing:char-d800', 'character-writing:char-110000', 'character-writing:4f60', 'word-meaning:a b'])(
    '%s is not',
    (id) => expect(isItemId(id)).toBe(false),
  );

  it('a character item matches its content id', () => {
    const event = exposure({ id: 'x', occurredAt: at(0), itemId: CHAR });
    expect(event.type === 'exposure' && event.content.contentId).toBe('char-4f60');
  });
});
