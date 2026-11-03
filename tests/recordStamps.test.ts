import { afterEach, describe, expect, it, vi } from 'vitest';
import { KEYS } from '../src/persistence/keys';
import { createMemoryKeyValue } from '../src/persistence/keyValue';
import { createProgressState } from '../src/stores/progressState';
import { createProgressStore } from '../src/stores/progressStore';
import { createVocabularyProgressStore } from '../src/stores/vocabularyProgressStore';

afterEach(() => { vi.useRealTimers(); });

describe('record stamps', () => {
  it('stamps every write with its time and this device', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const doc = createProgressState(createMemoryKeyValue(), { deviceId: 'phone' });
    const chars = createProgressStore(doc);
    const words = createVocabularyProgressStore(doc);
    chars.grade('一', 'good');
    words.introduce('word-a');
    vi.setSystemTime(2_000_000);
    chars.recordStrokes('一', 2);
    words.practice('word-a', 'good', false);
    expect(chars.get('一')).toMatchObject({ updatedAt: 2_000_000, deviceId: 'phone' });
    expect(words.get('word-a')).toMatchObject({ updatedAt: 2_000_000, deviceId: 'phone' });
  });

  it('puts the earlier stamp back when a session is discarded', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const doc = createProgressState(createMemoryKeyValue(), { deviceId: 'phone' });
    const words = createVocabularyProgressStore(doc);
    const chars = createProgressStore(doc);
    words.grade('word-a', 'good');
    const session = chars.checkpoint();
    vi.setSystemTime(2_000_000);
    words.grade('word-a', 'good');
    chars.rollback(session);
    expect(words.get('word-a')?.updatedAt).toBe(1_000_000);
  });

  it('makes a device id once and keeps it in the repo', () => {
    const repo = createMemoryKeyValue();
    const first = createProgressState(repo).deviceId;
    expect(first).toMatch(/\S{8,}/);
    expect(repo.read(KEYS.deviceId)).toBe(first);
    expect(createProgressState(repo).deviceId).toBe(first);
    expect(createProgressState(createMemoryKeyValue()).deviceId).not.toBe(first);
  });
});
