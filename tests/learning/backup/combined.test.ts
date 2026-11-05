import { describe, expect, it } from 'vitest';
import {
  createBackup,
  legacyCharactersToProgressFile,
  parseLegacyProgressFile,
  parseUserBackup,
  serializeBackup,
  serializeCombinedBackup,
  type CombinedBackup,
  type LegacyCharacterProgress,
} from '../../../src/domain/learning/backup';
import { parseProgress } from '../../../src/domain/progress/serialization';
import { at, twoDevices } from './fixtures';

const record = { right: 2, wrong: 1, reps: 1, lapses: 1, interval: 3, ease: 2.36, due: at(4), strokeRuns: 1, strokeBest: 0, lastSeen: at(1), clean: 1, lastReview: at(1), updatedAt: at(1), deviceId: 'device-a' };
const daily = { day: '2026-01-02', reviewed: 3, introduced: 1, streak: 2 };
const activity = { 'device-a': { '2026-01-02': 4 } };

/** A v4 file as `progressStore.exportBackup` writes it. */
const v4File = (words: Record<string, unknown> = { 'word-4f60-597d-ni3-hao3': record }) =>
  JSON.stringify({ version: 4, chars: { 好: record }, daily, words, wordDaily: { ...daily, reviewed: 7 }, activity, myWords: ['x'] });

const legacy: LegacyCharacterProgress = { version: 4, chars: { 好: record }, daily, activity };

const combined = async (): Promise<CombinedBackup> => {
  const { a } = await twoDevices();
  return { learning: createBackup({ deviceId: 'device-a', exportedAt: at(5), ...a }), legacyCharacters: legacy };
};

describe('combined file', () => {
  it('round trips both halves', async () => {
    const backup = await combined();
    expect(parseUserBackup(serializeCombinedBackup(backup))).toEqual({ ok: true, value: { source: 'combined', ...backup, warnings: [] } });
  });

  it('is built from the v4 export by dropping the vocabulary', () => {
    const parsed = parseLegacyProgressFile(v4File());
    expect(parsed.ok && parsed.value.legacyCharacters).toEqual(legacy);
  });

  it('prefixes errors in the learning half with its path', async () => {
    const file = JSON.parse(serializeCombinedBackup(await combined()));
    file.learning.events[0].localDay = 'ayer';
    const parsed = parseUserBackup(JSON.stringify(file));
    expect(parsed.ok || parsed.error.map((error) => error.path)).toEqual(['learning.events[0].localDay']);
  });

  it.each<[string, (file: Record<string, any>) => void, string]>([
    ['word progress inside the character half', (file) => (file.legacyCharacters.words = {}), 'legacyCharacters.words'],
    ['a malformed character record', (file) => (file.legacyCharacters.chars.好.right = -1), 'legacyCharacters.chars.好'],
    ['a key that is not one character', (file) => (file.legacyCharacters.chars.你好 = record), 'legacyCharacters.chars.你好'],
    ['an impossible daily log', (file) => (file.legacyCharacters.daily.day = '2026-02-30'), 'legacyCharacters.daily'],
    ['another legacy version', (file) => (file.legacyCharacters.version = 3), 'legacyCharacters.version'],
    ['a missing character half', (file) => delete file.legacyCharacters, 'legacyCharacters'],
    ['a missing learning half', (file) => delete file.learning, 'learning'],
    ['an unknown top-level key', (file) => (file.extra = true), 'extra'],
  ])('rejects %s', async (_name, edit, path) => {
    const file = JSON.parse(serializeCombinedBackup(await combined()));
    edit(file);
    const parsed = parseUserBackup(JSON.stringify(file));
    expect(parsed.ok || parsed.error.map((error) => error.path)).toContain(path);
  });

  it('turns the character half into a file the old store accepts', () => {
    const state = parseProgress(legacyCharactersToProgressFile(legacy));
    expect(state).toMatchObject({ chars: { 好: record }, daily, words: {}, wordDaily: { day: daily.day, reviewed: 0 }, activity });
  });
});

describe('legacy-only v4 file', () => {
  it('keeps the characters and ignores the words with a warning', () => {
    const parsed = parseUserBackup(v4File({ a: record, b: record }));
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
    expect(parsed.value).toMatchObject({ source: 'legacy-v4', learning: null, legacyCharacters: legacy });
    expect(parsed.value.warnings).toEqual([expect.objectContaining({ code: 'legacy-vocabulary-ignored', count: 2 })]);
  });

  it('warns about nothing when it has no words', () => {
    const parsed = parseUserBackup(v4File({}));
    expect(parsed.ok && parsed.value.warnings).toEqual([]);
  });

  it('does not read malformed word records it ignores', () => {
    expect(parseUserBackup(v4File({ a: { right: 'mal' } })).ok).toBe(true);
  });

  it('rejects malformed character records', () => {
    const file = JSON.parse(v4File());
    file.chars.好.ease = 1;
    const parsed = parseUserBackup(JSON.stringify(file));
    expect(parsed.ok || parsed.error.map((error) => error.path)).toEqual(['chars.好']);
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

describe('learning-only file', () => {
  it('is accepted without a character half', async () => {
    const { learning } = await combined();
    const parsed = parseUserBackup(serializeBackup(learning));
    expect(parsed).toEqual({ ok: true, value: { source: 'learning', learning, legacyCharacters: null, warnings: [] } });
  });
});
