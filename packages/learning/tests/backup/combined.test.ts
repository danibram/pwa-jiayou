import { describe, expect, it } from 'vitest';
import { createBackup, parseUserBackup, serializeBackup } from '../../src/backup/index.ts';
import { at, twoDevices } from './fixtures.ts';

const record = { right: 2, wrong: 1, reps: 1, lapses: 1, interval: 3, ease: 2.36, due: at(4), strokeRuns: 1, strokeBest: 0, lastSeen: at(1), clean: 1, lastReview: at(1), updatedAt: at(1), deviceId: 'device-a' };
const daily = { day: '2026-01-02', reviewed: 3, introduced: 1, streak: 2 };
const activity = { 'device-a': { '2026-01-02': 4 } };

/** A v4 progress file, as the old character store wrote it. */
const v4File = (words: Record<string, unknown> = { 'word-4f60-597d-ni3-hao3': record }, chars: Record<string, unknown> = { 好: record }) =>
  JSON.stringify({ version: 4, chars, daily, words, wordDaily: { ...daily, reviewed: 7 }, activity, myWords: ['x'] });

const learningBackup = async () => {
  const { a } = await twoDevices();
  return createBackup({ deviceId: 'device-a', exportedAt: at(5), ...a });
};

/** The phase 4 file: the learning log next to a v4 character half. */
const combinedFile = async (legacy: unknown = { version: 4, chars: { 好: record, 人: record }, daily, activity }) =>
  JSON.stringify({ learning: await learningBackup(), legacyCharacters: legacy });

describe('learning backup file', () => {
  it('round trips the event log and its configs', async () => {
    const learning = await learningBackup();
    const parsed = parseUserBackup(serializeBackup(learning));
    expect(parsed).toEqual({ ok: true, value: { source: 'learning', learning, warnings: [] } });
  });

  it.each([
    ['another version', JSON.stringify({ version: 3, chars: {}, daily }), 'unsupported-version'],
    ['not JSON', '{', 'invalid-json'],
    ['something else', JSON.stringify({ hello: 'world' }), 'invalid-format'],
    ['a list', '[]', 'invalid-format'],
  ])('rejects %s', (_name, raw, code) => {
    const parsed = parseUserBackup(raw);
    expect(parsed.ok || parsed.error[0].code).toBe(code);
  });
});

describe('older combined file', () => {
  it('keeps the learning log and ignores the character half with a warning', async () => {
    const parsed = parseUserBackup(await combinedFile());
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
    expect(parsed.value.source).toBe('combined');
    expect(parsed.value.learning).toEqual(await learningBackup());
    expect(parsed.value.warnings).toEqual([expect.objectContaining({ code: 'legacy-progress-ignored', count: 2 })]);
    expect(parsed.value.warnings[0].message).toMatch(/2 caracteres, que no se importa/);
  });

  it('does not check the character half it ignores', async () => {
    expect(parseUserBackup(await combinedFile({ version: 3, chars: { 你好: 'mal' } })).ok).toBe(true);
    const file = JSON.parse(await combinedFile());
    delete file.legacyCharacters;
    expect(parseUserBackup(JSON.stringify(file))).toMatchObject({ ok: true, value: { source: 'combined', warnings: [] } });
  });

  it('prefixes errors in the learning half with its path', async () => {
    const file = JSON.parse(await combinedFile());
    file.learning.events[0].localDay = 'ayer';
    const parsed = parseUserBackup(JSON.stringify(file));
    expect(parsed.ok || parsed.error.map((error) => error.path)).toEqual(['learning.events[0].localDay']);
  });

  it.each<[string, (file: Record<string, unknown>) => void, string]>([
    ['a missing learning half', (file) => delete file.learning, 'learning'],
    ['an unknown top-level key', (file) => (file.extra = true), 'extra'],
  ])('rejects %s', async (_name, edit, path) => {
    const file = JSON.parse(await combinedFile());
    edit(file);
    const parsed = parseUserBackup(JSON.stringify(file));
    expect(parsed.ok || parsed.error.map((error) => error.path)).toContain(path);
  });
});

describe('v4 progress file', () => {
  it('imports nothing and warns about its characters and words', () => {
    const parsed = parseUserBackup(v4File({ a: record, b: record }));
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
    expect(parsed.value).toMatchObject({ source: 'legacy-v4', learning: null });
    expect(parsed.value.warnings).toEqual([expect.objectContaining({ code: 'legacy-progress-ignored', count: 3 })]);
    expect(parsed.value.warnings[0].message).toMatch(/1 carácter y 2 palabras/);
  });

  it('has no warning when it is empty', () => {
    expect(parseUserBackup(v4File({}, {}))).toEqual({ ok: true, value: { source: 'legacy-v4', learning: null, warnings: [] } });
  });

  it('does not read the records it ignores', () => {
    expect(parseUserBackup(v4File({ a: { right: 'mal' } }, { 好: { ease: 1 } })).ok).toBe(true);
  });
});
