import { afterEach, describe, expect, it, vi } from 'vitest';
import { KEYS } from '../src/persistence/keys';
import { createMemoryKeyValue } from '../src/persistence/keyValue';
import { createProgressState } from '../src/stores/progressState';
import { createProgressStore } from '../src/stores/progressStore';

afterEach(() => { vi.useRealTimers(); });

describe('record stamps', () => {
  it('stamps every write with its time and this device', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const doc = createProgressState(createMemoryKeyValue(), { deviceId: 'phone' });
    const chars = createProgressStore(doc);
    chars.grade('一', 'good');
    chars.introduce('二');
    vi.setSystemTime(2_000_000);
    chars.recordStrokes('一', 2);
    expect(chars.get('一')).toMatchObject({ updatedAt: 2_000_000, deviceId: 'phone' });
    expect(chars.get('二')).toMatchObject({ updatedAt: 1_000_000, deviceId: 'phone' });
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
